const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createService, normalizeCode, assertOwner, assertUsable } = require("./device-link.cjs");

function fixture() {
  const data = new Map([
    [
      "employees/staff-1",
      { owner_uid: "owner-1", name: "Cashier", status: "active", permissions: { can_sales: true } },
    ],
    ["businesses/classic-world-settings", { name: "Classic World" }],
  ]);
  let id = 0,
    time = 1000,
    tail = Promise.resolve();
  const ref = (collection, key = `device-${++id}`) => ({
    id: key,
    path: `${collection}/${key}`,
    get: async function () {
      return snap(this);
    },
    update: async function (patch) {
      data.set(this.path, { ...data.get(this.path), ...patch });
    },
  });
  const snap = (r) => ({ id: r.id, exists: data.has(r.path), data: () => data.get(r.path) });
  const db = {
    collection: (name) => ({ doc: (key) => ref(name, key) }),
    runTransaction: (callback) => {
      const result = tail.then(() => {
        const writes = [];
        return Promise.resolve(
          callback({
            get: async (r) => snap(r),
            set: (r, v) => writes.push(() => data.set(r.path, v)),
            update: (r, v) => writes.push(() => data.set(r.path, { ...data.get(r.path), ...v })),
          }),
        ).then((value) => {
          writes.forEach((w) => w());
          return value;
        });
      });
      tail = result.catch(() => {});
      return result;
    },
  };
  const service = createService({
    db,
    now: () => time,
    auth: {
      getUser: async () => ({ disabled: false }),
      createCustomToken: async (uid) => `token-${uid}`,
      revokeRefreshTokens: async () => {},
    },
  });
  const owner = {
    auth: { uid: "owner-1", token: { firebase: { sign_in_provider: "google.com" } } },
    data: { employeeId: "staff-1" },
  };
  const redeem = (code) =>
    service.redeem({
      data: { code, deviceName: "Counter tablet" },
      rawRequest: { ip: "127.0.0.1" },
    });
  return {
    service,
    owner,
    redeem,
    data,
    advance: (ms) => {
      time += ms;
    },
  };
}

test("only authenticated parent accounts can issue codes", () => {
  assert.throws(() => assertOwner({}), /parent business/);
  assert.throws(
    () =>
      assertOwner({
        auth: {
          uid: "employee",
          token: { pos_employee: true, firebase: { sign_in_provider: "custom" } },
        },
      }),
    /parent business/,
  );
});
test("codes accept separators and reject expired and used records", () => {
  assert.equal(normalizeCode("ab12-cd34 ef56"), "AB12CD34EF56");
  assert.throws(() => assertUsable({ expires_at: 1000 }, 1000), /expired/);
  assert.throws(() => assertUsable({ expires_at: 5000, used_at: 1000 }, 1000), /already used/);
});
test("one employee device can redeem a code; replay and concurrent reuse fail", async () => {
  const f = fixture(),
    issued = await f.service.issue(f.owner);
  const results = await Promise.allSettled([f.redeem(issued.code), f.redeem(issued.code)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const result = results.find((r) => r.status === "fulfilled").value;
  assert.equal(result.user.id, "staff-1");
  assert.equal(result.user.role, "employee");
  assert.equal(result.user.permissions.can_sales, true);
  assert.equal(JSON.stringify([...f.data.values()]).includes(issued.code), false);
});
test("replacement codes invalidate older codes and expire after ten minutes", async () => {
  const f = fixture(),
    old = await f.service.issue(f.owner);
  const current = await f.service.issue(f.owner);
  await assert.rejects(f.redeem(old.code), /newer code/);
  f.advance(600000);
  await assert.rejects(f.redeem(current.code), /expired/);
});
test("disabled employees cannot link and revoked devices cannot refresh a session", async () => {
  const f = fixture(),
    issued = await f.service.issue(f.owner);
  f.data.get("employees/staff-1").status = "inactive";
  await assert.rejects(f.redeem(issued.code), /inactive/);
  f.data.get("employees/staff-1").status = "active";
  const linked = await f.redeem(issued.code);
  await f.service.revoke({ auth: f.owner.auth, data: { deviceId: linked.deviceId } });
  await assert.rejects(
    f.service.session({
      auth: { uid: `pos_device_${linked.deviceId}`, token: { device_link_id: linked.deviceId } },
    }),
    /unlinked/,
  );
});
test("code guesses are limited across service calls", async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++) await assert.rejects(f.redeem("AAAAAAAAAAAA"), /invalid/);
  await assert.rejects(f.redeem("AAAAAAAAAAAA"), /Too many attempts/);
});

test("any parent account can link its own staff, but cannot claim another business or legacy staff", async () => {
  const f = fixture();
  const other = {
    auth: { uid: "owner-2", token: { firebase: { sign_in_provider: "password" } } },
    data: { employeeId: "staff-1" },
  };
  await assert.rejects(f.service.issue(other), /does not belong/);
  f.data.get("employees/staff-1").owner_uid = "owner-2";
  assert.ok((await f.service.issue(other)).code);
  delete f.data.get("employees/staff-1").owner_uid;
  await assert.rejects(f.service.issue(other), /Legacy employees/);
});
