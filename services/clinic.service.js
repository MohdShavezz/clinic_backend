import { pool } from "../utils/dbConn.js";

const patientFields = `patient_id AS "patientId", patient_name AS "patientName",
  patient_age AS "patientAge", patient_phone AS "patientPhone", patient_email AS "patientEmail",
  patient_address AS "patientAddress", patient_city AS "patientCity", patient_state AS "patientState",
  patient_pincode AS "patientPincode", patient_country AS "patientCountry",
  patient_marker AS "patientMarker", patient_remark AS "patientRemark",
  created_at AS "createdAt", updated_at AS "updatedAt"`;
const labFields = `lab_id AS "labId", lab_name AS "labName", contact_name AS "contactName",
  phone, email, address, city, state, pincode, country, created_at AS "createdAt"`;

const getClient = async () => pool.connect();
const ensureOwned = async (client, table, idColumn, id, doctorId) => {
  const allowed = new Set(["patients", "labs", "medical_tests"]);
  if (!allowed.has(table)) throw new Error("Invalid table");
  const isAvailable = table === "medical_tests" ? "active = TRUE" : "archived_at IS NULL";
  const { rowCount } = await client.query(
    `SELECT 1 FROM ${table} WHERE ${idColumn} = $1 AND doctor_id = $2 AND ${isAvailable}`,
    [id, doctorId]
  );
  return rowCount > 0;
};

export const dashboard = async (doctorId) => {
  const { rows: [row] } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM patients WHERE doctor_id = $1 AND archived_at IS NULL) AS "patientCount",
      (SELECT COUNT(*)::int FROM consultations WHERE doctor_id = $1 AND date_of_consultation = CURRENT_DATE) AS "todayConsultations",
      (SELECT COUNT(*)::int FROM consultation_tests ct JOIN consultations c USING (consultation_id)
        WHERE c.doctor_id = $1 AND ct.status = 'Suggested') AS "pendingTests",
      (SELECT COUNT(*)::int FROM medical_reports WHERE doctor_id = $1) AS "reportCount"
  `, [doctorId]);
  return row;
};

export const listPatients = async (doctorId, search = "") => {
  const { rows } = await pool.query(
    `SELECT ${patientFields} FROM patients
     WHERE doctor_id = $1 AND archived_at IS NULL
       AND ($2 = '' OR patient_name ILIKE '%' || $2 || '%' OR patient_phone ILIKE '%' || $2 || '%' OR patient_email ILIKE '%' || $2 || '%')
     ORDER BY patient_name`,
    [doctorId, search.trim()]
  );
  return rows;
};

export const getPatient = async (doctorId, patientId) => {
  const { rows } = await pool.query(
    `SELECT ${patientFields} FROM patients WHERE patient_id = $1 AND doctor_id = $2 AND archived_at IS NULL`,
    [patientId, doctorId]
  );
  return rows[0] ?? null;
};

export const createPatient = async (doctorId, data) => {
  const { rows } = await pool.query(
    `INSERT INTO patients (doctor_id, patient_name, patient_age, patient_phone, patient_email,
      patient_address, patient_city, patient_state, patient_pincode, patient_country, patient_marker, patient_remark)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE(NULLIF($11,''),'Active'),$12)
     RETURNING ${patientFields}`,
    [doctorId, data.patientName.trim(), data.patientAge ?? null, data.patientPhone || null,
      data.patientEmail || null, data.patientAddress || null, data.patientCity || null,
      data.patientState || null, data.patientPincode || null, data.patientCountry || null,
      data.patientMarker || "Active", data.patientRemark?.trim() || null]
  );
  return rows[0];
};

export const updatePatient = async (doctorId, patientId, data) => {
  const allowed = {
    patientName: "patient_name", patientAge: "patient_age", patientPhone: "patient_phone",
    patientEmail: "patient_email", patientAddress: "patient_address", patientCity: "patient_city",
    patientState: "patient_state", patientPincode: "patient_pincode", patientCountry: "patient_country",
    patientMarker: "patient_marker", patientRemark: "patient_remark",
  };
  const values = [];
  const assignments = [];
  for (const [key, column] of Object.entries(allowed)) {
    if (data[key] === undefined) continue;
    values.push(data[key] === "" ? null : data[key]);
    assignments.push(`${column} = $${values.length}`);
  }
  if (!assignments.length) return getPatient(doctorId, patientId);
  values.push(patientId, doctorId);
  const { rows } = await pool.query(
    `UPDATE patients SET ${assignments.join(", ")}, updated_at = NOW()
     WHERE patient_id = $${values.length - 1} AND doctor_id = $${values.length} AND archived_at IS NULL
     RETURNING ${patientFields}`,
    values
  );
  return rows[0] ?? null;
};

export const archivePatient = async (doctorId, patientId) => {
  const { rowCount } = await pool.query(
    "UPDATE patients SET archived_at = NOW(), updated_at = NOW() WHERE patient_id = $1 AND doctor_id = $2 AND archived_at IS NULL",
    [patientId, doctorId]
  );
  return rowCount > 0;
};

export const listLabs = async (doctorId) => {
  const { rows } = await pool.query(
    `SELECT ${labFields} FROM labs WHERE doctor_id = $1 AND archived_at IS NULL ORDER BY lab_name`,
    [doctorId]
  );
  return rows;
};

export const saveLab = async (doctorId, data, labId = null) => {
  const values = [data.labName.trim(), data.contactName || null, data.phone || null, data.email || null,
    data.address || null, data.city || null, data.state || null, data.pincode || null, data.country || null];
  if (labId) {
    values.push(labId, doctorId);
    const { rows } = await pool.query(
      `UPDATE labs SET lab_name=$1, contact_name=$2, phone=$3, email=$4, address=$5, city=$6,
        state=$7, pincode=$8, country=$9, updated_at=NOW()
       WHERE lab_id=$10 AND doctor_id=$11 AND archived_at IS NULL RETURNING ${labFields}`,
      values
    );
    return rows[0] ?? null;
  }
  const { rows } = await pool.query(
    `INSERT INTO labs (doctor_id,lab_name,contact_name,phone,email,address,city,state,pincode,country)
     VALUES ($10,$1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${labFields}`,
    [...values, doctorId]
  );
  return rows[0];
};

export const archiveLab = async (doctorId, labId) => {
  const { rowCount } = await pool.query(
    "UPDATE labs SET archived_at=NOW(), updated_at=NOW() WHERE lab_id=$1 AND doctor_id=$2 AND archived_at IS NULL",
    [labId, doctorId]
  );
  return rowCount > 0;
};

export const listParameters = async (doctorId) => {
  const { rows } = await pool.query(
    `SELECT parameter_id AS "parameterId", parameter, unit FROM report_parameters_master
     WHERE doctor_id=$1 ORDER BY parameter`, [doctorId]
  );
  return rows;
};

export const saveParameter = async (doctorId, { parameter, unit = "" }) => {
  const { rows } = await pool.query(
    `INSERT INTO report_parameters_master (doctor_id,parameter,unit) VALUES ($1,$2,$3)
     ON CONFLICT (doctor_id,parameter) DO UPDATE SET unit=EXCLUDED.unit
     RETURNING parameter_id AS "parameterId", parameter, unit`,
    [doctorId, parameter.trim(), unit.trim()]
  );
  return rows[0];
};

export const listTests = async (doctorId) => {
  const { rows } = await pool.query(`
    SELECT t.test_id AS "testId", t.test_name AS "testName", t.description, t.active,
      COALESCE(json_agg(json_build_object('parameterId',p.parameter_id,'parameter',p.parameter,'unit',mtp.unit))
        FILTER (WHERE p.parameter_id IS NOT NULL), '[]') AS parameters
    FROM medical_tests t
    LEFT JOIN medical_test_parameters mtp USING (test_id)
    LEFT JOIN report_parameters_master p USING (parameter_id)
    WHERE t.doctor_id=$1 AND t.active=TRUE
    GROUP BY t.test_id ORDER BY t.test_name
  `, [doctorId]);
  return rows;
};

export const createTest = async (doctorId, data) => {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const { rows: [test] } = await client.query(
      `INSERT INTO medical_tests (doctor_id,test_name,description) VALUES ($1,$2,$3)
       RETURNING test_id AS "testId", test_name AS "testName", description, active`,
      [doctorId, data.testName.trim(), data.description || null]
    );
    const parameters = [];
    for (const item of data.parameters ?? []) {
      const { rows: [parameter] } = await client.query(
        `INSERT INTO report_parameters_master (doctor_id,parameter,unit) VALUES ($1,$2,$3)
         ON CONFLICT (doctor_id,parameter) DO UPDATE SET unit=EXCLUDED.unit
         RETURNING parameter_id AS "parameterId", parameter, unit`,
        [doctorId, item.parameter.trim(), (item.unit ?? "").trim()]
      );
      await client.query(
        `INSERT INTO medical_test_parameters (test_id,parameter_id,unit) VALUES ($1,$2,$3)
         ON CONFLICT (test_id,parameter_id) DO UPDATE SET unit=EXCLUDED.unit`,
        [test.testId, parameter.parameterId, parameter.unit]
      );
      parameters.push(parameter);
    }
    await client.query("COMMIT");
    return { ...test, parameters };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const listConsultations = async (doctorId, patientId = null) => {
  const { rows } = await pool.query(`
    SELECT c.consultation_id AS "consultationId", c.patient_id AS "patientId",
      p.patient_name AS "patientName", c.date_of_consultation AS "dateOfConsultation",
      c.scanned_doc_id AS "scannedDocId", c.next_consultation_date AS "nextConsultationDate",
      c.notes, COALESCE(json_agg(json_build_object('consultationTestId',ct.consultation_test_id,
        'testId',t.test_id,'testName',t.test_name,'labId',l.lab_id,'labName',l.lab_name,'status',ct.status))
        FILTER (WHERE ct.consultation_test_id IS NOT NULL), '[]') AS tests
    FROM consultations c
    JOIN patients p USING (patient_id)
    LEFT JOIN consultation_tests ct USING (consultation_id)
    LEFT JOIN medical_tests t USING (test_id)
    LEFT JOIN labs l USING (lab_id)
    WHERE c.doctor_id=$1 AND ($2::bigint IS NULL OR c.patient_id=$2)
    GROUP BY c.consultation_id,p.patient_name ORDER BY c.date_of_consultation DESC,c.consultation_id DESC
  `, [doctorId, patientId]);
  return rows;
};

export const createConsultation = async (doctorId, data) => {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    if (!(await ensureOwned(client, "patients", "patient_id", data.patientId, doctorId))) {
      const error = new Error("Patient not found."); error.status = 404; throw error;
    }
    const { rows: [consultation] } = await client.query(
      `INSERT INTO consultations (patient_id,doctor_id,date_of_consultation,scanned_doc_id,next_consultation_date,notes)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING consultation_id AS "consultationId", patient_id AS "patientId",
        date_of_consultation AS "dateOfConsultation", scanned_doc_id AS "scannedDocId",
        next_consultation_date AS "nextConsultationDate", notes`,
      [data.patientId, doctorId, data.dateOfConsultation || new Date().toISOString().slice(0,10),
        data.scannedDocId || null, data.nextConsultationDate || null, data.notes || null]
    );
    for (const suggested of data.tests ?? []) {
      const ownsTest = await ensureOwned(client, "medical_tests", "test_id", suggested.testId, doctorId);
      const ownsLab = await ensureOwned(client, "labs", "lab_id", suggested.labId, doctorId);
      if (!ownsTest || !ownsLab) {
        const error = new Error("Choose a test and lab from your clinic."); error.status = 400; throw error;
      }
      await client.query(
        `INSERT INTO consultation_tests (consultation_id,test_id,lab_id) VALUES ($1,$2,$3)
         ON CONFLICT (consultation_id,test_id,lab_id) DO NOTHING`,
        [consultation.consultationId, suggested.testId, suggested.labId]
      );
    }
    await client.query("COMMIT");
    return consultation;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updateConsultation = async (doctorId, consultationId, data) => {
  const fields = {
    dateOfConsultation: "date_of_consultation",
    nextConsultationDate: "next_consultation_date",
    scannedDocId: "scanned_doc_id",
    notes: "notes",
  };
  const values = [];
  const assignments = [];
  for (const [key, column] of Object.entries(fields)) {
    if (data[key] === undefined) continue;
    values.push(data[key] === "" ? null : data[key]);
    assignments.push(`${column}=$${values.length}`);
  }
  const client = await getClient();
  try {
    await client.query("BEGIN");
    if (assignments.length) {
      values.push(consultationId, doctorId);
      const { rowCount } = await client.query(
        `UPDATE consultations SET ${assignments.join(", ")}, updated_at=NOW()
         WHERE consultation_id=$${values.length - 1} AND doctor_id=$${values.length}`,
        values
      );
      if (!rowCount) {
        const error = new Error("Consultation not found."); error.status = 404; throw error;
      }
    }
    if (Array.isArray(data.tests)) {
      for (const item of data.tests) {
        if (!new Set(["Suggested", "Scheduled", "Completed", "Cancelled"]).has(item.status)) {
          const error = new Error("Invalid test status."); error.status = 400; throw error;
        }
        const { rowCount } = await client.query(
          `UPDATE consultation_tests ct SET status=$1 FROM consultations c
           WHERE ct.consultation_test_id=$2 AND ct.consultation_id=c.consultation_id
             AND c.consultation_id=$3 AND c.doctor_id=$4`,
          [item.status, item.consultationTestId, consultationId, doctorId]
        );
        if (!rowCount) {
          const error = new Error("Suggested test not found."); error.status = 404; throw error;
        }
      }
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const listReports = async (doctorId, patientId = null) => {
  const { rows } = await pool.query(`
    SELECT r.report_id AS "reportId", r.patient_id AS "patientId", p.patient_name AS "patientName",
      r.consultation_id AS "consultationId", r.test_id AS "testId", t.test_name AS "testName",
      r.lab_id AS "labId", l.lab_name AS "labName", r.date_of_test AS "dateOfTest",
      r.scanned_doc_id AS "scannedDocId", r.notes,
      COALESCE(json_agg(json_build_object('parameterId',rp.parameter_id,'parameter',rp.parameter,
        'unit',rp.unit,'resultValue',rp.result_value,'referenceRange',rp.reference_range))
        FILTER (WHERE rp.report_parameter_id IS NOT NULL), '[]') AS parameters
    FROM medical_reports r JOIN patients p USING (patient_id)
    JOIN labs l USING (lab_id) LEFT JOIN medical_tests t USING (test_id)
    LEFT JOIN medical_report_parameters rp USING (report_id)
    WHERE r.doctor_id=$1 AND ($2::bigint IS NULL OR r.patient_id=$2)
    GROUP BY r.report_id,p.patient_name,t.test_name,l.lab_name ORDER BY r.date_of_test DESC,r.report_id DESC
  `, [doctorId, patientId]);
  return rows;
};

export const createReport = async (doctorId, data) => {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    if (!(await ensureOwned(client, "patients", "patient_id", data.patientId, doctorId))) {
      const error = new Error("Patient not found."); error.status = 404; throw error;
    }
    if (!(await ensureOwned(client, "labs", "lab_id", data.labId, doctorId))) {
      const error = new Error("Lab not found."); error.status = 404; throw error;
    }
    if (data.testId && !(await ensureOwned(client, "medical_tests", "test_id", data.testId, doctorId))) {
      const error = new Error("Test not found."); error.status = 404; throw error;
    }
    if (data.consultationId) {
      const { rowCount } = await client.query(
        `SELECT 1 FROM consultations WHERE consultation_id=$1 AND doctor_id=$2 AND patient_id=$3`,
        [data.consultationId, doctorId, data.patientId]
      );
      if (!rowCount) {
        const error = new Error("Consultation does not belong to this patient."); error.status = 400; throw error;
      }
    }
    const { rows: [report] } = await client.query(
      `INSERT INTO medical_reports (patient_id,consultation_id,test_id,lab_id,doctor_id,date_of_test,scanned_doc_id,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING report_id AS "reportId"`,
      [data.patientId, data.consultationId || null, data.testId || null, data.labId, doctorId,
        data.dateOfTest, data.scannedDocId || null, data.notes || null]
    );
    for (const item of data.parameters) {
      let parameterId = item.parameterId || null;
      if (parameterId) {
        const { rowCount } = await client.query(
          "SELECT 1 FROM report_parameters_master WHERE parameter_id=$1 AND doctor_id=$2",
          [parameterId, doctorId]
        );
        if (!rowCount) {
          const error = new Error("Report parameter not found."); error.status = 400; throw error;
        }
      } else {
        const { rows: [master] } = await client.query(
          `SELECT parameter_id FROM report_parameters_master WHERE doctor_id=$1 AND LOWER(parameter)=LOWER($2) LIMIT 1`,
          [doctorId, item.parameter.trim()]
        );
        parameterId = master?.parameter_id ?? null;
      }
      await client.query(
        `INSERT INTO medical_report_parameters (report_id,parameter_id,parameter,unit,result_value,reference_range)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [report.reportId, parameterId, item.parameter.trim(), item.unit || "", String(item.resultValue), item.referenceRange || null]
      );
    }
    await client.query("COMMIT");
    return report;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
