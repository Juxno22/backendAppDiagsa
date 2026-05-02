const connection = require("../config/connection");
const query = (sql, values = []) => {
    return new Promise((resolve, reject) => {
        connection.query(sql, values, (error, results) => {
            if (error) reject(error);
            else resolve(results);
        });
    });
};
//Plantillas
async function getAllPlantillas() {
    const plantillas = await query(`
        SELECT plantillaId, nombre, descripcion, activa, createdAt
        FROM evaluacion_plantillas ORDER BY createdAt DESC
    `);
    return await Promise.all(
        plantillas.map(async (p) => {
            const secciones = await query(
                `
            SELECT seccionId, nombre, orden FROM evaluacion_secciones
            WHERE plantillaId = ? ORDER BY orden
        `,
                [p.plantillaId],
            );
            const seccionesConPreguntas = await Promise.all(
                secciones.map(async (s) => {
                    const preguntas = await query(
                        `
                SELECT preguntaId, pregunta, orden FROM evaluacion_preguntas
                WHERE seccionId = ? ORDER BY orden
            `,
                        [s.seccionId],
                    );
                    return { ...s, preguntas, totalPreguntas: preguntas.length };
                }),
            );
            return {
                ...p,
                secciones: seccionesConPreguntas,
                totalSecciones: secciones.length,
            };
        }),
    );
}

async function getPlantillaById(plantillaId) {
    const rows = await query(
        "SELECT plantillaId, nombre, descripcion, activa FROM evaluacion_plantillas WHERE plantillaId = ?",
        [plantillaId],
    );
    if (rows.length === 0) return null;
    const secciones = await query(
        "SELECT seccionId, nombre, orden FROM evaluacion_secciones WHERE plantillaId = ? ORDER BY orden",
        [plantillaId],
    );
    const seccionesConPreguntas = await Promise.all(
        secciones.map(async (s) => {
            const preguntas = await query(
                "SELECT preguntaId, pregunta, orden FROM evaluacion_preguntas WHERE seccionId = ? ORDER BY orden",
                [s.seccionId],
            );
            return { ...s, preguntas, totalPreguntas: preguntas.length };
        }),
    );
    return {
        ...rows[0],
        secciones: seccionesConPreguntas,
        totalSecciones: secciones.length,
    };
}

async function createPlantilla(nombre, descripcion = null) {
    const existe = await query(
        "SELECT plantillaId FROM evaluacion_plantillas WHERE nombre = ?",
        [nombre],
    );
    if (existe.length > 0)
        return {
            success: false,
            message: "Ya existe una plantilla con ese nombre",
        };
    const result = await query(
        "INSERT INTO evaluacion_plantillas (nombre, descripcion) VALUES (?, ?)",
        [nombre, descripcion],
    );
    return {
        success: true,
        message: "Plantilla creada correctamente",
        plantillaId: result.insertId,
    };
}

async function updatePlantilla(plantillaId, nombre, descripcion = null) {
    const existe = await query(
        "SELECT plantillaId FROM evaluacion_plantillas WHERE plantillaId = ?",
        [plantillaId],
    );
    if (existe.length === 0)
        return { success: false, message: "Plantilla no encontrada" };
    const duplicado = await query(
        "SELECT plantillaId FROM evaluacion_plantillas WHERE nombre = ? AND plantillaId != ?",
        [nombre, plantillaId],
    );
    if (duplicado.length > 0)
        return {
            success: false,
            message: "Ya existe una plantilla con ese nombre",
        };
    await query(
        "UPDATE evaluacion_plantillas SET nombre = ?, descripcion = ? WHERE plantillaId = ?",
        [nombre, descripcion, plantillaId],
    );
    return { success: true, message: "Plantilla actualizada correctamente" };
}

async function deletePlantilla(plantillaId) {
    const existe = await query(
        "SELECT plantillaId FROM evaluacion_plantillas WHERE plantillaId = ?",
        [plantillaId],
    );
    if (existe.length === 0)
        return { success: false, message: "Plantilla no encontrada" };
    const evaluaciones = await query(
        "SELECT evaluacionesId FROM evaluaciones WHERE plantillaId = ? LIMIT 1",
        [plantillaId],
    );
    if (evaluaciones.length > 0)
        return {
            success: false,
            message:
                "No se puede eliminar una plantilla con evaluaciones registradas",
        };
    await query("DELETE FROM evaluacion_plantillas WHERE plantillaId = ?", [
        plantillaId,
    ]);
    return { success: true, message: "Plantilla eliminada correctamente" };
}
/**
 * Obtiene todas las secciones con sus preguntas y conteo.
 * @returns {Array} Secciones con preguntas anidadas
 */
async function getAllSecciones(plantillaId) {
    const secciones = await query(
        "SELECT seccionId, nombre, orden FROM evaluacion_secciones WHERE plantillaId = ? ORDER BY orden",
        [plantillaId],
    );
    return await Promise.all(
        secciones.map(async (s) => {
            const preguntas = await query(
                "SELECT preguntaId, pregunta, orden FROM evaluacion_preguntas WHERE seccionId = ? ORDER BY orden",
                [s.seccionId],
            );
            return { ...s, preguntas, totalPreguntas: preguntas.length };
        }),
    );
}
/**
 * Crea una nueva sección.
 * Máximo 5 secciones permitidas.
 * @param {string} nombre - Nombre de la sección
 * @returns {Object} { success, message, seccionId? }
 */
async function createSeccion(nombre, plantillaId) {
    const plantilla = await query(
        "SELECT plantillaId FROM evaluacion_plantillas WHERE plantillaId = ?",
        [plantillaId],
    );
    if (plantilla.length === 0)
        return { success: false, message: "Plantilla no encontrada" };
    const total = await query(
        "SELECT COUNT(*) AS total FROM evaluacion_secciones WHERE plantillaId = ?",
        [plantillaId],
    );
    if (total[0].total >= 5)
        return { success: false, message: "Máximo 5 secciones por plantilla" };
    const existe = await query(
        "SELECT seccionId FROM evaluacion_secciones WHERE nombre = ? AND plantillaId = ?",
        [nombre, plantillaId],
    );
    if (existe.length > 0)
        return { success: false, message: "Ya existe una sección con ese nombre" };
    const maxOrden = await query(
        "SELECT MAX(orden) AS maxOrden FROM evaluacion_secciones WHERE plantillaId = ?",
        [plantillaId],
    );
    const orden = (maxOrden[0].maxOrden || 0) + 1;
    const result = await query(
        "INSERT INTO evaluacion_secciones (nombre, orden, plantillaId) VALUES (?, ?, ?)",
        [nombre, orden, plantillaId],
    );
    return {
        success: true,
        message: "Sección creada correctamente",
        seccionId: result.insertId,
    };
}
/**
 * Actualiza el nombre de una sección.
 * @param {number} seccionId - ID de la sección
 * @param {string} nombre    - Nuevo nombre
 * @returns {Object} { success, message }
 */
async function updateSeccion(seccionId, nombre) {
    const existe = await query(
        "SELECT seccionId, plantillaId FROM evaluacion_secciones WHERE seccionId = ?",
        [seccionId],
    );
    if (existe.length === 0)
        return { success: false, message: "Sección no encontrada" };
    const duplicado = await query(
        "SELECT seccionId FROM evaluacion_secciones WHERE nombre = ? AND plantillaId = ? AND seccionId != ?",
        [nombre, existe[0].plantillaId, seccionId],
    );
    if (duplicado.length > 0)
        return { success: false, message: "Ya existe una sección con ese nombre" };
    await query(
        "UPDATE evaluacion_secciones SET nombre = ? WHERE seccionId = ?",
        [nombre, seccionId],
    );
    return { success: true, message: "Sección actualizada correctamente" };
}

/**
 * Elimina una sección y sus preguntas.
 * No se puede eliminar si tiene evaluaciones con respuestas.
 * @param {number} seccionId - ID de la sección
 * @returns {Object} { success, message }
 */
async function deleteSeccion(seccionId) {
    const existe = await query(
        "SELECT seccionId, plantillaId FROM evaluacion_secciones WHERE seccionId = ?",
        [seccionId],
    );
    if (existe.length === 0)
        return { success: false, message: "Sección no encontrada" };
    const respuestas = await query(
        `
        SELECT er.respuestaId FROM evaluacion_respuestas er
        INNER JOIN evaluacion_preguntas ep ON er.preguntaId = ep.preguntaId
        WHERE ep.seccionId = ? LIMIT 1
    `,
        [seccionId],
    );
    if (respuestas.length > 0)
        return {
            success: false,
            message: "No se puede eliminar una sección con evaluaciones registradas",
        };
    await query("DELETE FROM evaluacion_preguntas WHERE seccionId = ?", [
        seccionId,
    ]);
    await query("DELETE FROM evaluacion_secciones WHERE seccionId = ?", [
        seccionId,
    ]);
    const restantes = await query(
        "SELECT seccionId FROM evaluacion_secciones WHERE plantillaId = ? ORDER BY orden",
        [existe[0].plantillaId],
    );
    for (let i = 0; i < restantes.length; i++) {
        await query(
            "UPDATE evaluacion_secciones SET orden = ? WHERE seccionId = ?",
            [i + 1, restantes[i].seccionId],
        );
    }
    return { success: true, message: "Sección eliminada correctamente" };
}
async function getPreguntasBySeccion(seccionId) {
    return await query(
        "SELECT preguntaId, pregunta, orden FROM evaluacion_preguntas WHERE seccionId = ? ORDER BY orden",
        [seccionId],
    );
}

async function createPregunta(seccionId, pregunta) {
    const seccion = await query(
        "SELECT seccionId FROM evaluacion_secciones WHERE seccionId = ?",
        [seccionId],
    );
    if (seccion.length === 0)
        return { success: false, message: "Sección no encontrada" };
    const total = await query(
        "SELECT COUNT(*) AS total FROM evaluacion_preguntas WHERE seccionId = ?",
        [seccionId],
    );
    if (total[0].total >= 5)
        return { success: false, message: "Máximo 5 preguntas por sección" };
    const maxOrden = await query(
        "SELECT MAX(orden) AS maxOrden FROM evaluacion_preguntas WHERE seccionId = ?",
        [seccionId],
    );
    const orden = (maxOrden[0].maxOrden || 0) + 1;
    const result = await query(
        "INSERT INTO evaluacion_preguntas (seccionId, pregunta, orden) VALUES (?, ?, ?)",
        [seccionId, pregunta, orden],
    );
    return {
        success: true,
        message: "Pregunta creada correctamente",
        preguntaId: result.insertId,
    };
}

async function updatePregunta(preguntaId, pregunta) {
    const existe = await query(
        "SELECT preguntaId FROM evaluacion_preguntas WHERE preguntaId = ?",
        [preguntaId],
    );
    if (existe.length === 0)
        return { success: false, message: "Pregunta no encontrada" };
    await query(
        "UPDATE evaluacion_preguntas SET pregunta = ? WHERE preguntaId = ?",
        [pregunta, preguntaId],
    );
    return { success: true, message: "Pregunta actualizada correctamente" };
}

async function deletePregunta(preguntaId) {
    const existe = await query(
        "SELECT preguntaId, seccionId FROM evaluacion_preguntas WHERE preguntaId = ?",
        [preguntaId],
    );
    if (existe.length === 0)
        return { success: false, message: "Pregunta no encontrada" };
    const respuestas = await query(
        "SELECT respuestaId FROM evaluacion_respuestas WHERE preguntaId = ? LIMIT 1",
        [preguntaId],
    );
    if (respuestas.length > 0)
        return {
            success: false,
            message: "No se puede eliminar una pregunta con respuestas registradas",
        };
    const seccionId = existe[0].seccionId;
    await query("DELETE FROM evaluacion_preguntas WHERE preguntaId = ?", [
        preguntaId,
    ]);
    const restantes = await query(
        "SELECT preguntaId FROM evaluacion_preguntas WHERE seccionId = ? ORDER BY orden",
        [seccionId],
    );
    for (let i = 0; i < restantes.length; i++) {
        await query(
            "UPDATE evaluacion_preguntas SET orden = ? WHERE preguntaId = ?",
            [i + 1, restantes[i].preguntaId],
        );
    }
    return { success: true, message: "Pregunta eliminada correctamente" };
}

module.exports = {
    getAllPlantillas,
    getPlantillaById,
    createPlantilla,
    updatePlantilla,
    deletePlantilla,
    getAllSecciones,
    createSeccion,
    updateSeccion,
    deleteSeccion,
    getPreguntasBySeccion,
    createPregunta,
    updatePregunta,
    deletePregunta,
};
