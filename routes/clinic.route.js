import { Router } from "express";
import isAuthenticated from "../middlewares/isAuthenticated.js";
import { consultations, dashboard, labs, parameters, patients, reports, tests } from "../controllers/clinic.controller.js";

const router = Router();
router.use(isAuthenticated);

router.get("/dashboard", dashboard);

router.route("/patients").get(patients.list).post(patients.create);
router.route("/patients/:patientId").get(patients.get).put(patients.update).delete(patients.remove);

router.route("/labs").get(labs.list).post(labs.create);
router.route("/labs/:labId").put(labs.update).delete(labs.remove);

router.route("/parameters").get(parameters.list).post(parameters.create);
router.route("/tests").get(tests.list).post(tests.create);
router.route("/consultations").get(consultations.list).post(consultations.create);
router.route("/consultations/:consultationId").put(consultations.update);
router.route("/reports").get(reports.list).post(reports.create);

export default router;
