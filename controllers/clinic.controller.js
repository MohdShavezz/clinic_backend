import * as clinic from "../services/clinic.service.js";

const send = (res, data, status = 200) => res.status(status).json({ success: true, data });
const fail = (res, error) => {
  console.error("Clinic API error:", error);
  const status = error.status || (error.code === "23505" ? 409 : 500);
  return res.status(status).json({
    success: false,
    message: status === 500 ? "Unable to complete this request." : error.message,
  });
};
const handler = (fn) => async (req, res) => {
  try {
    const result = await fn(req);
    if (result?.notFound) return res.status(404).json({ success: false, message: result.message || "Record not found." });
    return send(res, result?.data ?? result, result?.status ?? 200);
  } catch (error) {
    return fail(res, error);
  }
};
const isMissing = (value) => value === undefined || value === null || String(value).trim() === "";

export const dashboard = handler((req) => clinic.dashboard(req.id));

export const patients = {
  list: handler((req) => clinic.listPatients(req.id, req.query.search || "")),
  get: handler(async (req) => {
    const data = await clinic.getPatient(req.id, req.params.patientId);
    return data ?? { notFound: true, message: "Patient not found." };
  }),
  create: handler(async (req) => {
    if (isMissing(req.body.patientName)) throw Object.assign(new Error("Patient name is required."), { status: 400 });
    const age = req.body.patientAge === "" || req.body.patientAge == null ? null : Number(req.body.patientAge);
    if (age !== null && (!Number.isInteger(age) || age < 0 || age > 125)) {
      throw Object.assign(new Error("Enter a valid patient age."), { status: 400 });
    }
    return { data: await clinic.createPatient(req.id, { ...req.body, patientAge: age }), status: 201 };
  }),
  update: handler(async (req) => {
    if (req.body.patientAge !== undefined && req.body.patientAge !== "") {
      const age = Number(req.body.patientAge);
      if (!Number.isInteger(age) || age < 0 || age > 125) throw Object.assign(new Error("Enter a valid patient age."), { status: 400 });
      req.body.patientAge = age;
    }
    const data = await clinic.updatePatient(req.id, req.params.patientId, req.body);
    return data ?? { notFound: true, message: "Patient not found." };
  }),
  remove: handler(async (req) => ({ data: { archived: await clinic.archivePatient(req.id, req.params.patientId) } })),
};

export const labs = {
  list: handler((req) => clinic.listLabs(req.id)),
  create: handler(async (req) => {
    if (isMissing(req.body.labName)) throw Object.assign(new Error("Lab name is required."), { status: 400 });
    return { data: await clinic.saveLab(req.id, req.body), status: 201 };
  }),
  update: handler(async (req) => {
    if (isMissing(req.body.labName)) throw Object.assign(new Error("Lab name is required."), { status: 400 });
    const data = await clinic.saveLab(req.id, req.body, req.params.labId);
    return data ?? { notFound: true, message: "Lab not found." };
  }),
  remove: handler(async (req) => {
    const archived = await clinic.archiveLab(req.id, req.params.labId);
    return archived ? { archived: true } : { notFound: true, message: "Lab not found." };
  }),
};

export const parameters = {
  list: handler((req) => clinic.listParameters(req.id)),
  create: handler(async (req) => {
    if (isMissing(req.body.parameter)) throw Object.assign(new Error("Parameter name is required."), { status: 400 });
    return { data: await clinic.saveParameter(req.id, req.body), status: 201 };
  }),
};

export const tests = {
  list: handler((req) => clinic.listTests(req.id)),
  create: handler(async (req) => {
    const { testName, parameters: items = [] } = req.body;
    if (isMissing(testName)) throw Object.assign(new Error("Test name is required."), { status: 400 });
    if (!Array.isArray(items) || items.some((item) => isMissing(item.parameter) || isMissing(item.unit))) {
      throw Object.assign(new Error("Each test parameter needs a name and unit."), { status: 400 });
    }
    return { data: await clinic.createTest(req.id, req.body), status: 201 };
  }),
};

export const consultations = {
  list: handler((req) => clinic.listConsultations(req.id, req.query.patientId || null)),
  create: handler(async (req) => {
    const { patientId, tests: suggested = [] } = req.body;
    if (isMissing(patientId) || isMissing(req.body.dateOfConsultation)) {
      throw Object.assign(new Error("Patient and consultation date are required."), { status: 400 });
    }
    if (!Array.isArray(suggested) || suggested.some((item) => isMissing(item.testId) || isMissing(item.labId))) {
      throw Object.assign(new Error("Each suggested test needs a test and lab."), { status: 400 });
    }
    return { data: await clinic.createConsultation(req.id, req.body), status: 201 };
  }),
  update: handler(async (req) => {
    if (!Object.keys(req.body).length) throw Object.assign(new Error("Provide fields to update."), { status: 400 });
    await clinic.updateConsultation(req.id, req.params.consultationId, req.body);
    return { updated: true };
  }),
};

export const reports = {
  list: handler((req) => clinic.listReports(req.id, req.query.patientId || null)),
  create: handler(async (req) => {
    const { patientId, labId, dateOfTest, parameters: items } = req.body;
    if (isMissing(patientId) || isMissing(labId) || isMissing(dateOfTest)) {
      throw Object.assign(new Error("Patient, lab, and test date are required."), { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0 || items.some((item) => isMissing(item.parameter) || isMissing(item.resultValue))) {
      throw Object.assign(new Error("Add at least one parameter with a result."), { status: 400 });
    }
    return { data: await clinic.createReport(req.id, req.body), status: 201 };
  }),
};
