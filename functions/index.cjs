const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { createService } = require("./device-link.cjs");
initializeApp();
const methods = {
  issueEmployeeDeviceCode: "issue",
  redeemEmployeeDeviceCode: "redeem",
  employeeDeviceSession: "session",
  listEmployeeDevices: "list",
  revokeEmployeeDevice: "revoke",
};
for (const [name, method] of Object.entries(methods)) {
  exports[name] = onCall(
    { region: "us-central1", maxInstances: 5, cors: true },
    async (request) => {
      const service = createService({ db: getFirestore(), auth: getAuth() });
      try {
        return await service[method](request);
      } catch (error) {
        if (
          error.code &&
          [
            "permission-denied",
            "unauthenticated",
            "invalid-argument",
            "failed-precondition",
            "resource-exhausted",
          ].includes(error.code)
        )
          throw new HttpsError(error.code, error.message);
        throw new HttpsError("internal", "Device linking is unavailable. Please try again.");
      }
    },
  );
}
