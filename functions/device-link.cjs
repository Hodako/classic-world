const { randomBytes, createHash } = require("node:crypto");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const normalizeCode = (value) =>
  String(value || "")
    .replace(/[\s-]/g, "")
    .toUpperCase();

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}
function assertOwner(request) {
  const token = request.auth?.token;
  const provider = token?.firebase?.sign_in_provider;
  if (
    !request.auth ||
    !token ||
    token.pos_employee ||
    !provider ||
    ["anonymous", "custom"].includes(provider)
  )
    fail("permission-denied", "Sign in with your parent business account to link devices.");
}
function assertActive(employee) {
  if (
    !employee ||
    employee.status === "inactive" ||
    employee.status === "suspended" ||
    employee.status === "frozen" ||
    employee.is_active === false
  ) {
    fail(
      "permission-denied",
      "Employee is missing or inactive. Ask the owner to enable the account.",
    );
  }
}
function assertUsable(link, now) {
  if (!link || link.used_at || link.expires_at <= now)
    fail(
      "failed-precondition",
      "Code is invalid, expired, or already used. Ask the owner for a new code.",
    );
}

function createService({ db, auth, now = Date.now }) {
  async function employeeUser(employeeId, ownerUid) {
    const [employee, business] = await Promise.all([
      db.collection("employees").doc(employeeId).get(),
      db.collection("users").doc(ownerUid).get(),
    ]);
    assertActive(employee.exists ? employee.data() : null);
    const e = employee.data(),
      b = business.data() || {};
    if (e.owner_uid !== ownerUid)
      fail(
        "permission-denied",
        "Employee does not belong to your business. Legacy employees must be assigned to their owner by an administrator.",
      );
    return {
      id: employeeId,
      employee_id: employeeId,
      full_name: e.name || "Employee",
      email: e.email || `emp_${employeeId}@classicworld.com`,
      role: "employee",
      permissions: e.permissions || {},
      activated: true,
      status: "active",
      business_id: e.business_id || ownerUid,
      business_name: e.business_name || b.business_name || b.businessName || b.name || "Business",
      logo_url: b.logo_url || "/logo.png",
      activeProfile: "default",
    };
  }
  return {
    async issue(request) {
      assertOwner(request);
      const employeeId = String(request.data?.employeeId || "");
      if (!employeeId || employeeId.includes("/")) fail("invalid-argument", "Select an employee.");
      const employee = await employeeUser(employeeId, request.auth.uid);
      const code = randomBytes(6).toString("hex").toUpperCase();
      const hash = digest(code),
        expiresAt = now() + 10 * 60 * 1000;
      const pointer = db.collection("employee_link_current").doc(employeeId);
      await db.runTransaction(async (tx) => {
        tx.set(db.collection("employee_link_codes").doc(hash), {
          employee_id: employeeId,
          owner_uid: request.auth.uid,
          expires_at: expiresAt,
          used_at: null,
        });
        tx.set(pointer, { hash });
      });
      return { code: code.match(/.{4}/g).join("-"), expiresAt, employeeName: employee.full_name };
    },
    async redeem(request) {
      const code = normalizeCode(request.data?.code);
      if (!/^[A-F0-9]{12}$/.test(code))
        fail("invalid-argument", "Enter the complete device code from your owner.");
      // Persist the limiter across instances. Never store the raw address or code.
      const address =
        request.rawRequest?.ip || request.rawRequest?.socket?.remoteAddress || "unknown";
      const bucket = db.collection("employee_link_limits").doc(digest(address));
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(bucket),
          old = snap.data() || {};
        const recent = old.until > now();
        if (recent && old.attempts >= 5)
          fail("resource-exhausted", "Too many attempts. Try again in ten minutes.");
        tx.set(bucket, {
          attempts: recent ? old.attempts + 1 : 1,
          until: recent ? old.until : now() + 600000,
        });
      });
      const ref = db.collection("employee_link_codes").doc(digest(code));
      const deviceRef = db.collection("employee_linked_devices").doc();
      const preliminary = await ref.get();
      assertUsable(preliminary.exists ? preliminary.data() : null, now());
      const link = preliminary.data();
      const owner = await auth.getUser(link.owner_uid);
      if (owner.disabled) fail("permission-denied", "This business owner account is disabled.");
      const user = await employeeUser(link.employee_id, link.owner_uid);
      const uid = `pos_device_${deviceRef.id}`;
      const customToken = await auth.createCustomToken(uid, {
        pos_employee: true,
        device_link_id: deviceRef.id,
        employee_id: link.employee_id,
        owner_uid: link.owner_uid,
      });
      await db.runTransaction(async (tx) => {
        const [snap, current, employee] = await Promise.all([
          tx.get(ref),
          tx.get(db.collection("employee_link_current").doc(link.employee_id)),
          tx.get(db.collection("employees").doc(link.employee_id)),
        ]);
        assertUsable(snap.exists ? snap.data() : null, now());
        assertActive(employee.exists ? employee.data() : null);
        if (employee.data().owner_uid !== link.owner_uid)
          fail("permission-denied", "Employee ownership changed.");
        if (current.data()?.hash !== ref.id)
          fail("failed-precondition", "A newer code was issued. Ask the owner for that code.");
        tx.update(ref, { used_at: now() });
        tx.set(deviceRef, {
          uid,
          employee_id: link.employee_id,
          owner_uid: link.owner_uid,
          name: String(request.data?.deviceName || "Employee device")
            .trim()
            .slice(0, 80),
          linked_at: now(),
          revoked_at: null,
        });
      });
      return { customToken, user, deviceId: deviceRef.id };
    },
    async session(request) {
      const deviceId = request.auth?.token?.device_link_id;
      if (!deviceId) fail("unauthenticated", "Link this device to continue.");
      const snap = await db.collection("employee_linked_devices").doc(deviceId).get(),
        device = snap.data();
      if (!device || device.uid !== request.auth.uid || device.revoked_at)
        fail("permission-denied", "This device has been unlinked. Ask the owner for a new code.");
      const owner = await auth.getUser(device.owner_uid);
      if (owner.disabled) fail("permission-denied", "This business owner account is disabled.");
      return { user: await employeeUser(device.employee_id, device.owner_uid) };
    },
    async list(request) {
      assertOwner(request);
      const snap = await db
        .collection("employee_linked_devices")
        .where("owner_uid", "==", request.auth.uid)
        .get();
      return {
        devices: snap.docs
          .filter((d) => !d.data().revoked_at)
          .map((d) => ({
            id: d.id,
            employeeId: d.data().employee_id,
            name: d.data().name,
            linkedAt: d.data().linked_at,
          })),
      };
    },
    async revoke(request) {
      assertOwner(request);
      const deviceId = String(request.data?.deviceId || "");
      if (!deviceId || deviceId.includes("/")) fail("invalid-argument", "Select a device.");
      const ref = db.collection("employee_linked_devices").doc(deviceId),
        snap = await ref.get(),
        device = snap.data();
      if (!device || device.owner_uid !== request.auth.uid)
        fail("permission-denied", "Device does not belong to this owner.");
      await ref.update({ revoked_at: now() });
      try {
        await auth.revokeRefreshTokens(device.uid);
      } catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
      }
      return { success: true };
    },
  };
}
module.exports = { createService, normalizeCode, assertUsable, assertOwner };
