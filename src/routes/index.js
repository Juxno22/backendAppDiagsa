const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const connection = require("../config/connection");
const { authMiddleware, soloSupervisor, soloRH,
    soloMandos, soloRHAdmin, puedeVerDepartamento,
    ROL_RHADMIN, ROL_RH, ROL_SUPERVISOR,
    ROL_GERENTE, ROL_COLABORADOR, } = require("../middlewares/auth");
const { upload, subirImagen } = require("../config/cloudinary");
const { uploadPDF, subirPDF } = require('../config/cloudinary');
const { generarWordEvaluacion } = require("../models/generarWordEvaluacion");
const { generarWordPermiso } = require('../models/generarWordPermiso');
const { generarExcelBD,
    generarExcelContrato,
    registrarLog,
    getExportLogs,
    SECCIONES_VALIDAS, } = require('../models/exportarBD');
const {
    crearPermiso, getPermisosByEmpleado, getTodosPermisos,
    getPermisoById, responderPermiso, deletePermiso,
} = require('../models/permisos');
const {
    generarNotificaciones,
    generarNotificacionesPendientesRH,
    getNotificacionesRH,
    marcarComoLeida,
    marcarTodasComoLeidas,
    contarNoLeidas,
} = require("../models/notificacionesRH");
const {
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
} = require("../models/evaluacionesCrud");
const {
    createUser,
    loginUser,
    getPuestos,
    getRoles,
    getDiasVacaciones,
    getPeriodosDeEvaluacion,
    getTipos,
    getSueldos,
    generarUsuario,
    getDepartamentos,
} = require("../models/createUser");
const {
    getEmpleadoById,
    getVacacionesByEmpleado,
    solicitarVacaciones,
    getAllEmpleados,
    updateEmpleado,
    createEvaluacion,
    getEvaluacionesByEmpleado,
    responderVacaciones,
    getVacacionesPendientes,
    getNotificacionesByEmpleado,
    getDiasVacacionesLFT,
    deleteEmpleado,
    getTodasVacaciones,
    upsertVehiculo,
    getHijosByEmpleado,
    addHijo,
    deleteHijo,
    getAllEmpleadosPorAcceso
} = require("../models/empleado");
const {
    getSecciones,
    getSeccionesSimple,
    createEvaluacionCompleta,
    getEvaluacionesByEmpleado: getEvaluacionesCompletas,
    getEvaluacionById,
    getAllEvaluaciones,
} = require("../models/evaluaciones");
const { generarExcelVacaciones } = require("../models/generarExcelVacaciones");
const {
    solicitarVacante,
    getVacantesSolicitante,
    getAllVacantes,
    gestionarVacanteRH,
    deleteVacante,
} = require('../models/vacantes');
const {
    VAPID_PUBLIC_KEY,
    guardarSuscripcionPush,
    enviarPushAUsuario,
    enviarPushARol,
    getPushLogs,
} = require('../models/pushNotifications');
const query = (sql, values = []) =>
    new Promise((resolve, reject) => {
        connection.query(sql, values, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
// POST /api/rh/empleados/:id/foto
router.post(
    "/rh/empleados/:id/foto",
    authMiddleware,
    upload.single("foto"),
    async (req, res) => {
        try {
            const { id } = req.params;

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "No se proporcionó ninguna imagen",
                });
            }

            // Subir a Cloudinary con el ID del usuario como nombre
            const url = await subirImagen(
                req.file.buffer,
                "diagsa_empleados",
                `empleado_${id}`,
            );

            // Guardar URL en la BD
            await new Promise((resolve, reject) => {
                connection.query(
                    "UPDATE usuarios SET foto = ? WHERE usuarioId = ?",
                    [url, id],
                    (err) => (err ? reject(err) : resolve(null)),
                );
            });

            res.json({ success: true, data: { foto: url } });
        } catch (error) {
            console.error("Error al subir foto:", error);
            res.status(500).json({ success: false, message: error.message });
        }
    },
);
// Rutas de catálogos sin prefijo (para compatibilidad con el frontend web)
router.get("/roles", async (req, res) => {
    try {
        const roles = await getRoles();
        res.json({ success: true, data: roles });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get("/puestos", async (req, res) => {
    try {
        const puestos = await getPuestos();
        res.json({ success: true, data: puestos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get("/tipos", async (req, res) => {
    try {
        const tipos = await getTipos();
        res.json({ success: true, data: tipos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get("/sueldos", async (req, res) => {
    try {
        const sueldos = await getSueldos();
        res.json({ success: true, data: sueldos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get("/diasvacaciones", async (req, res) => {
    try {
        const dias = await getDiasVacaciones();
        res.json({ success: true, data: dias });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get("/periodosevaluacion", async (req, res) => {
    try {
        const periodos = await getPeriodosDeEvaluacion();
        res.json({ success: true, data: periodos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get("/evaluaciones/secciones", authMiddleware, async (req, res) => {
    try {
        const secciones = await getSecciones();
        res.json({ success: true, data: secciones });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/login
 * Recibe usuario y contraseña, devuelve JWT si son correctos.
 * Body: { usuario, contrasenia }
 */
router.post("/login", async (req, res) => {
    try {
        const { usuario, contrasenia } = req.body;

        if (!usuario || !contrasenia) {
            return res.status(400).json({
                success: false,
                message: "usuario y contrasenia son requeridos",
            });
        }

        const result = await loginUser(usuario, contrasenia);
        const statusCode = result.success ? 200 : 401;
        res.status(statusCode).json(result);
    } catch (error) {
        console.error("Error en /login:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Error interno",
        });
    }
});
router.get("/empleados/puestos", authMiddleware, async (req, res) => {
    try {
        const puestos = await getPuestos();
        res.json({
            success: true,
            data: puestos,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || "Error al obtener los puestos",
        });
    }
});

router.get("/empleados/roles", authMiddleware, async (req, res) => {
    try {
        const roles = await getRoles();
        res.json({
            success: true,
            data: roles,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || "Error al obtener los roles",
        });
    }
});

router.get("/empleados/tipos", authMiddleware, async (req, res) => {
    try {
        const tipos = await getTipos();
        res.json({
            success: true,
            data: tipos,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || "Error al obtener los tipos de puesto",
        });
    }
});

router.get("/empleados/diasvacaciones", authMiddleware, async (req, res) => {
    try {
        const diasvacaciones = await getDiasVacaciones();
        res.json({
            success: true,
            data: diasvacaciones,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || "Error al obtener los dias de vacaciones",
        });
    }
});

router.get(
    "/empleados/periodosevaluacion",
    authMiddleware,
    async (req, res) => {
        try {
            const periodosDeEvaluacion = await getPeriodosDeEvaluacion();
            res.json({
                success: true,
                data: periodosDeEvaluacion,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message || "Error al obtener los periodos de evaluacion",
            });
        }
    },
);

router.get("/empleados/sueldos", authMiddleware, async (req, res) => {
    try {
        const sueldos = await getSueldos();
        res.json({
            success: true,
            data: sueldos,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || "Error al obtener los sueldos",
        });
    }
});
//crear nuevo usuario
router.post("/createuser", authMiddleware, async (req, res) => {
    try {
        //validar que todos los campos necesarios estén presentes
        const requiredFields = [
            "nombre",
            "apPaterno",
            "apMaterno",
            "usuario",
            "contrasenia",
            "puestoId",
            "rolId",
            "fechaContratacion",
            "departamento",
            "sucursalId",
            "departamentoId",
        ];
        const missingFields = requiredFields.filter((field) => !req.body[field]);
        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Faltan campos requeridos: ${missingFields.join(", ")}`,
            });
        }
        const idFields = ["puestoId", "rolId", "sucursalId", "departamentoId"];
        for (const field of idFields) {
            if (isNaN(req.body[field])) {
                return res.status(400).json({
                    success: false,
                    message: `El campo ${field} debe ser un número válido`,
                });
            }
        }
        //crear nuevo usuario
        const result = await createUser(req.body);
        if (result.success) {
            await generarNotificaciones(result.usuarioId);
            res.status(200).json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error("Error en la ruta", error);
        res.status(500).json({
            success: false,
            message: error.message || "Error al crear el usuario",
        });
    }
});

router.get("/empleados/health", (req, res) => {
    res.json({
        success: true,
        message: "API funcionando correctamente",
        timestamp: new Date().toISOString(),
    });
});
/**
 * GET /api/empleados/mi-perfil
 * El empleado consulta su propia información.
 * Requiere: token de sesión → req.user.usuarioId
 */
router.get("/empleados/mi-perfil", authMiddleware, async (req, res) => {
    try {
        const usuarioId = req.user.usuarioId; // ← solo del token
        const empleado = await getEmpleadoById(usuarioId);
        if (!empleado) {
            return res
                .status(404)
                .json({ success: false, message: "Empleado no encontrado" });
        }
        res.json({ success: true, data: empleado });
    } catch (error) {
        res
            .status(500)
            .json({ success: false, message: error.message || "Error interno" });
    }
});
/**
 * GET /api/empleados/mis-vacaciones
 * El empleado consulta el historial de sus solicitudes de vacaciones.
 */
router.get("/empleados/mis-vacaciones", authMiddleware, async (req, res) => {
    try {
        const usuarioId = req.user.usuarioId; // ← solo del token
        const vacaciones = await getVacacionesByEmpleado(usuarioId);
        res.json({ success: true, data: vacaciones });
    } catch (error) {
        res
            .status(500)
            .json({ success: false, message: error.message || "Error interno" });
    }
});
/**
 * POST /api/empleados/solicitar-vacaciones
 * El empleado crea una nueva solicitud de vacaciones.
 * Body esperado: { usuarioId, fechaInicio, fechaFin, dias_vacacionesId }
 */
router.post(
    "/empleados/solicitar-vacaciones",
    authMiddleware,
    async (req, res) => {
        try {
            const { fechaInicio, fechaFin, dias_vacacionesId } = req.body;
            const usuarioId = req.user.usuarioId;
            const rolSolicitante = req.user.rolId;

            if (!fechaInicio || !fechaFin || !dias_vacacionesId) {
                return res
                    .status(400)
                    .json({ success: false, message: "Faltan campos requeridos" });
            }

            const result = await solicitarVacaciones(
                usuarioId,
                fechaInicio,
                fechaFin,
                dias_vacacionesId,
            );

            if (!result.success) return res.status(400).json(result);

            // ── RH: aprobar automáticamente sin autorización ──
            if (rolSolicitante === 3) {
                await new Promise((resolve, reject) => {
                    connection.query(
                        `UPDATE vacaciones SET 
                        estado_final = 'Aceptadas',
                        respuesta_jefe_inmediato = 'Aceptadas',
                        respuesta_RH = 'Aceptadas'
                     WHERE vacacionesId = ?`,
                        [result.vacacionesId],
                        (err) => (err ? reject(err) : resolve(null)),
                    );
                });
                return res.json({
                    success: true,
                    message: "Vacaciones aprobadas automáticamente",
                    vacacionesId: result.vacacionesId,
                });
            }

            // ── Supervisor: requiere solo autorización de RH ──
            if (rolSolicitante === 2) {
                await new Promise((resolve, reject) => {
                    connection.query(
                        `UPDATE vacaciones SET 
                        respuesta_jefe_inmediato = 'Aceptadas'
                     WHERE vacacionesId = ?`,
                        [result.vacacionesId],
                        (err) => (err ? reject(err) : resolve(null)),
                    );
                });
                return res.json({
                    success: true,
                    message: "Solicitud enviada. Pendiente de autorización de RH",
                    vacacionesId: result.vacacionesId,
                });
            }

            res.status(result.success ? 200 : 400).json(result);
        } catch (error) {
            res
                .status(500)
                .json({ success: false, message: error.message || "Error interno" });
        }
    },
);
/**
 * GET /api/supervisor/empleados
 * El supervisor obtiene la lista de todos los empleados.
 */
router.get('/supervisor/empleados', authMiddleware, async (req, res) => {
    try {
        const empleados = await getAllEmpleadosPorAcceso(req);
        res.json({
            success: true,
            data: empleados,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
/**
 * GET /api/supervisor/empleados/:id
 * El supervisor consulta el perfil completo de un empleado específico.
 */
router.get('/supervisor/empleados/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        console.log('[GET empleado by ID] inicio', {
            id,
            usuarioId: req.user?.usuarioId,
            rolId: req.user?.rolId,
            sucursalId: req.user?.sucursalId,
            departamentoId: req.user?.departamentoId,
        });
        const empleado = await getEmpleadoById(Number(id));
        console.log('[GET empleado by ID] resultado', {
            id,
            encontrado: !!empleado,
        });
        if (!empleado) {
            return res.status(404).json({
                success: false,
                message: 'Empleado no encontrado',
            });
        }
        return res.json({
            success: true,
            data: empleado,
        });
    } catch (error) {
        console.error('[GET empleado by ID] error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Error al obtener empleado',
        });
    }
});
/**
 * PATCH /api/supervisor/empleados/:id
 * El supervisor actualiza parcialmente la información de un empleado.
 * Body: cualquier subconjunto de { nombre, apPaterno, apMaterno, puestoId,
 *        tipoId, sueldoId, rolId, fechaContratacion, departamento, jefe_inmediato }
 */
router.patch('/supervisor/empleados/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const body = { ...req.body };

        // Auto-calcular fondo ahorro y sueldo neto
        if (body.sueldo) {
            body.fondo_ahorro = Math.round(Number(body.sueldo_bruto) * 0.05 * 100) / 100;
            body.sueldo_neto = Math.round(Number(body.sueldo_bruto) * 0.95 * 100) / 100;
            body.sueldo = body.sueldo_bruto; // compatibilidad
        }

        const result = await updateEmpleado(id, body);
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
})
/**
 * POST /api/supervisor/evaluaciones
 * El supervisor registra una nueva evaluación para un empleado.
 * Body: { usuarioId, fecha_evaluacion, periodo_evaluacionesId, promedio_final,
 *         recontratacion, comentario_final, ...comentarios opcionales }
 */
router.post("/supervisor/evaluaciones", authMiddleware, async (req, res) => {
    try {
        //validar los campos obligatorios de las evaluaciones
        const camposRequeridos = [
            "usuarioId",
            "fecha_evaluacion",
            "periodo_evaluacionesId",
            "promedio_final",
            "recontratacion",
            "comentario_final",
        ];
        const faltantes = camposRequeridos.filter(
            (c) => req.body[c] === undefined || req.body[c] === "",
        );
        if (faltantes.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Faltan campos requeridos",
            });
        }
        //validar que recontratacion sea un valor ENUM
        if (!["Si", "No"].includes(req.body.recontratacion)) {
            return res.status(400).json({
                success: false,
                message: "Recontratacion no tiene un valor valido",
            });
        }
        const result = await createEvaluacion(req.body);
        const statusCode = result.success ? 201 : 400;
        res.status(statusCode).json(result);
    } catch (error) {
        console.error("Error al crear la evaluacion", error);
        res.status(500).json({
            success: false,
            message: error.message || "Error interno",
        });
    }
});
/**
 * GET /api/supervisor/evaluaciones/:usuarioId
 * El supervisor consulta el historial de evaluaciones de un empleado.
 */
router.get(
    "/supervisor/evaluaciones/:usuarioId",
    authMiddleware,
    async (req, res) => {
        try {
            const { usuarioId } = req.params;
            if (isNaN(usuarioId)) {
                return res.status(400).json({
                    success: "Error en el Id",
                });
            }
            const evaluaciones = await getEvaluacionesByEmpleado(usuarioId);
            res.json({
                success: true,
                data: evaluaciones,
            });
        } catch (error) {
            console.error("Error al obtener las evaluaciones", error);
            res.status(500).json({
                success: false,
                message: error.message || "Error interno",
            });
        }
    },
);
/**
 * GET /api/supervisor/vacaciones/pendientes
 * El supervisor/RH ve todas las solicitudes de vacaciones sin respuesta.
 */
router.get(
    "/supervisor/vacaciones/pendientes",
    authMiddleware,
    async (req, res) => {
        try {
            const pendientes = await getVacacionesPendientes();
            res.json({
                success: true,
                data: pendientes,
            });
        } catch (error) {
            console.error("Error al mostrar las vacaciones pendientes", error);
            res.status(500).json({
                success: false,
                message: error.message || "Error interno",
            });
        }
    },
);
/**
 * PATCH /api/supervisor/vacaciones/:id/responder
 * El supervisor (jefe o RH) acepta o deniega una solicitud de vacaciones.
 * Body: { respuesta: 'Aceptadas' | 'Denegadas', rol: 'jefe' | 'rh' }
 */
router.patch(
    "/supervisor/vacaciones/:id/responder",
    authMiddleware,
    async (req, res) => {
        console.log("Body recibido:", req.body); // ← agrega esta línea
        console.log("Params:", req.params); // ← y esta
        try {
            const { id } = req.params;
            const { respuesta, rol } = req.body;
            if (isNaN(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Id erroneo",
                });
            }
            if (!respuesta || !rol) {
                return res.status(400).json({
                    success: false,
                    message: "CCampos faltantes",
                });
            }
            if (!["Aceptadas", "Denegadas"].includes(respuesta)) {
                return res.status(400).json({
                    success: false,
                    message: "respuestas erroneas",
                });
            }
            const result = await responderVacaciones(id, respuesta, rol);
            const statusCode = result.success ? 200 : 400;
            res.status(statusCode).json(result);
        } catch (error) {
            console.error("Error al responder vacaciones", error);
            res.status(400).json({
                success: false,
                message: error.message || "Error interno",
            });
        }
    },
);
/**
 * GET /api/empleados/notificaciones
 * El empleado obtiene sus notificaciones (vacaciones + evaluaciones).
 */
router.get("/empleados/notificaciones", authMiddleware, async (req, res) => {
    try {
        const usuarioId = req.user.usuarioId;
        const notificaciones = await getNotificacionesByEmpleado(usuarioId);
        res.json({ success: true, data: notificaciones });
    } catch (error) {
        console.error("Error al obtener notificaciones:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Error interno",
        });
    }
});
router.get("/evaluaciones-secciones", authMiddleware, async (req, res) => {
    try {
        const secciones = await getSecciones();
        res.json({
            success: true,
            data: secciones,
        });
    } catch (error) {
        console.error("Error al obtener las secciones", error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
router.get("/evaluaciones", authMiddleware, async (req, res) => {
    try {
        console.log("Body recibido:", JSON.stringify(req.body, null, 2));
        console.log("Usuario:", req.user);
        const evaluaciones = await getAllEvaluaciones();
        res.json({
            success: true,
            data: evaluaciones,
        });
    } catch (error) {
        console.error("Error al obtener las evaluaciones", error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
router.get("/evaluaciones/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: "Id invalido",
            });
        }
        const evaluacion = await getEvaluacionById(id);
        if (!evaluacion) {
            return res.status(400).json({
                success: false,
                message: "Evaluacion no encontrada",
            });
        }
        res.json({
            success: true,
            data: evaluacion,
        });
    } catch (error) {
        console.error("Error al obtener evaluacion", error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
router.get(
    "/evaluaciones/empleado/:usuarioId",
    authMiddleware,
    async (req, res) => {
        try {
            const { usuarioId } = req.params;
            if (isNaN(usuarioId)) {
                return res.status(400).json({
                    success: false,
                    message: "Id invalido",
                });
            }
            const evaluacion = await getEvaluacionesCompletas(usuarioId);
            res.json({
                success: true,
                data: evaluacion,
            });
        } catch (error) {
            console.error("Error al obtener evaluacion del empleado", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },
);
router.post("/evaluaciones", authMiddleware, async (req, res) => {
    try {
        //campos obligatorios
        const camposRequeridos = [
            "usuarioId",
            "fecha_evaluacion",
            "periodo_evaluacionesId",
            "promedio_final",
            "recontratacion",
            "comentario_final",
            "respuestas",
        ];
        const faltantes = camposRequeridos.filter(
            (c) => req.body[c] === undefined || req.body[c] === "",
        );
        if (faltantes.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Faltan campos requeridos: ${faltantes.join(", ")}`,
            });
        }
        //validar recontratacion
        if (!["Si", "No"].includes(req.body.recontratacion)) {
            return res.status(400).json({
                success: false,
                message: 'Recontratacion debe ser "Si" o  "No" ',
            });
        }
        //validar que respuesta sea un array con elementos
        if (
            !Array.isArray(req.body.respuestas) ||
            req.body.respuestas.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
        //validar puntuuacion 1-5
        const puntuacionInvalida = req.body.respuestas.find(
            (r) =>
                !r.preguntaId || !r.puntuacion || r.puntuacion < 1 || r.puntuacion > 5,
        );
        if (puntuacionInvalida) {
            return res.status(400).json({
                success: false,
                message: "Puntuacion invalida",
            });
        }
        //el evaluador esta autenticado
        const evalData = {
            ...req.body,
            evaluador_id: req.user.usuarioId,
        };
        const result = await createEvaluacionCompleta(evalData);
        const statusCode = result.success ? 201 : 400;
        res.status(statusCode).json(result);
    } catch (error) {
        console.error("Error al crear evaluacion", error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
/**
 * GET /api/empleados/mis-dias-vacaciones
 * Devuelve los días de vacaciones que le corresponden
 * al empleado según su antigüedad (LFT).
 */
router.get(
    "/empleados/mis-dias-vacaciones",
    authMiddleware,
    async (req, res) => {
        try {
            const usuarioId = req.user.usuarioId;
            const resultado = await getDiasVacacionesLFT(usuarioId);

            if (!resultado) {
                return res.status(404).json({
                    success: false,
                    message: "Empleado no encontrado",
                });
            }
            if (resultado.dias === 0) {
                return res.json({
                    success: true,
                    data: resultado,
                    message: "Aún no tienes derecho a vacaciones (menos de 1 año)",
                });
            }
            res.json({ success: true, data: resultado });
        } catch (error) {
            console.error("Error al obtener días de vacaciones LFT:", error);
            res.status(500).json({ success: false, message: error.message });
        }
    },
);
/**
 * POST /api/generar-usuario
 * Genera un nombre de usuario automático basado en el nombre completo.
 * Body: { nombre, apPaterno, apMaterno }
 */
router.post("/generar-usuario", async (req, res) => {
    try {
        const { nombre, apPaterno, apMaterno } = req.body;
        if (!nombre || !apPaterno || !apMaterno) {
            return res.status(400).json({
                success: false,
                message: "nombre, apPaterno y apMaterno son requeridos",
            });
        }
        const usuario = await generarUsuario(nombre, apPaterno, apMaterno);
        res.json({ success: true, data: { usuario } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
/**
 * DELETE /api/rh/empleados/:id
 * Elimina un empleado. Requiere verificar la contraseña del RH.
 * Body: { contrasenia }
 */
router.delete('/rh/empleados/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { contrasenia, motivo_baja, motivo_detalle, finiquito, observaciones } = req.body;
        const rhId = req.user.usuarioId
        if (!contrasenia)
            return res.status(400).json({ success: false, message: 'Se requiere tu contraseña' });
        if (finiquito !== undefined && finiquito !== null && finiquito !== '') {
            const finiquitoNum = Number(finiquito);
            if (isNaN(finiquitoNum)) {
                return res.status(400).json({
                    success: false,
                    message: 'Finiquito inválido',
                });
            }
        };
        const rows = await new Promise((resolve, reject) => {
            connection.query('SELECT contrasenia FROM usuarios WHERE usuarioId = ?',
                [rhId], (err, r) => err ? reject(err) : resolve(r));
        });
        if (!rows.length) return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
        const match = await bcrypt.compare(contrasenia, rows[0].contrasenia);
        if (!match) return res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
        const result = await deleteEmpleado(Number(id), req.user.rolId, {
            motivo_baja: motivo_baja || 'otro',
            motivo_detalle: motivo_detalle || null,
            finiquito: finiquito !== undefined && finiquito !== null && finiquito !== '' ? Number(finiquito) : null,
            observaciones: observaciones || null,
            registrado_por: rhId,
        });
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
/**
 * GET /api/rh/secciones
 * Lista todas las secciones con sus preguntas.
 * Acceso: RH
 */
router.get("/rh/secciones", authMiddleware, async (req, res) => {
    try {
        const secciones = await getAllSecciones();
        res.json({ success: true, data: secciones });
    } catch (error) {
        console.error("Error al obtener secciones:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
/**
 * POST /api/rh/secciones
 * Crea una nueva sección. Máximo 5.
 * Body: { nombre }
 */
router.post("/rh/secciones", authMiddleware, async (req, res) => {
    try {
        const { nombre } = req.body;
        if (!nombre?.trim()) {
            return res.status(400).json({
                success: false,
                message: "El nombre de la sección es requerido",
            });
        }
        const result = await createSeccion(nombre.trim());
        res.status(result.success ? 201 : 400).json(result);
    } catch (error) {
        console.error("Error al crear sección:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
/**
 * PATCH /api/rh/secciones/:id
 * Actualiza el nombre de una sección.
 * Body: { nombre }
 */
router.patch("/rh/secciones/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre } = req.body;
        if (!nombre?.trim()) {
            return res.status(400).json({
                success: false,
                message: "El nombre de la sección es requerido",
            });
        }
        const result = await updateSeccion(Number(id), nombre.trim());
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        console.error("Error al actualizar sección:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
/**
 * DELETE /api/rh/secciones/:id
 * Elimina una sección y sus preguntas.
 * No se puede eliminar si tiene evaluaciones registradas.
 */
router.delete("/rh/secciones/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await deleteSeccion(Number(id));
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        console.error("Error al eliminar sección:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
/** Preguntas
 * GET /api/rh/secciones/:id/preguntas
 * Lista las preguntas de una sección.
 */
router.get("/rh/secciones/:id/preguntas", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const preguntas = await getPreguntasBySeccion(Number(id));
        res.json({ success: true, data: preguntas });
    } catch (error) {
        console.error("Error al obtener preguntas:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
/**
 * POST /api/rh/secciones/:id/preguntas
 * Crea una pregunta en una sección. Máximo 5 por sección.
 * Body: { pregunta }
 */
router.post("/rh/secciones/:id/preguntas", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { pregunta } = req.body;
        if (!pregunta?.trim()) {
            return res.status(400).json({
                success: false,
                message: "El texto de la pregunta es requerido",
            });
        }
        const result = await createPregunta(Number(id), pregunta.trim());
        res.status(result.success ? 201 : 400).json(result);
    } catch (error) {
        console.error("Error al crear pregunta:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
/**
 * PATCH /api/rh/preguntas/:id
 * Actualiza el texto de una pregunta.
 * Body: { pregunta }
 */
router.patch("/rh/preguntas/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { pregunta } = req.body;
        if (!pregunta?.trim()) {
            return res.status(400).json({
                success: false,
                message: "El texto de la pregunta es requerido",
            });
        }
        const result = await updatePregunta(Number(id), pregunta.trim());
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        console.error("Error al actualizar pregunta:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
/**
 * DELETE /api/rh/preguntas/:id
 * Elimina una pregunta.
 * No se puede eliminar si tiene respuestas en evaluaciones.
 */
router.delete("/rh/preguntas/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await deletePregunta(Number(id));
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        console.error("Error al eliminar pregunta:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
// GET /api/rh/plantillas
router.get("/rh/plantillas", authMiddleware, async (req, res) => {
    try {
        const plantillas = await getAllPlantillas();
        res.json({ success: true, data: plantillas });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/rh/plantillas/:id
router.get("/rh/plantillas/:id", authMiddleware, async (req, res) => {
    try {
        const plantilla = await getPlantillaById(Number(req.params.id));
        if (!plantilla)
            return res
                .status(404)
                .json({ success: false, message: "Plantilla no encontrada" });
        res.json({ success: true, data: plantilla });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/rh/plantillas
router.post("/rh/plantillas", authMiddleware, async (req, res) => {
    try {
        const { nombre, descripcion } = req.body;
        if (!nombre?.trim())
            return res
                .status(400)
                .json({ success: false, message: "El nombre es requerido" });
        const result = await createPlantilla(
            nombre.trim(),
            descripcion?.trim() || null,
        );
        res.status(result.success ? 201 : 400).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PATCH /api/rh/plantillas/:id
router.patch("/rh/plantillas/:id", authMiddleware, async (req, res) => {
    try {
        const { nombre, descripcion } = req.body;
        if (!nombre?.trim())
            return res
                .status(400)
                .json({ success: false, message: "El nombre es requerido" });
        const result = await updatePlantilla(
            Number(req.params.id),
            nombre.trim(),
            descripcion?.trim() || null,
        );
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/rh/plantillas/:id
router.delete("/rh/plantillas/:id", authMiddleware, async (req, res) => {
    try {
        const result = await deletePlantilla(Number(req.params.id));
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/rh/plantillas/:plantillaId/secciones
router.post(
    "/rh/plantillas/:plantillaId/secciones",
    authMiddleware,
    async (req, res) => {
        try {
            const { nombre } = req.body;
            if (!nombre?.trim())
                return res
                    .status(400)
                    .json({ success: false, message: "El nombre es requerido" });
            const result = await createSeccion(
                nombre.trim(),
                Number(req.params.plantillaId),
            );
            res.status(result.success ? 201 : 400).json(result);
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    },
);
// GET /api/supervisor/vacaciones/todas
router.get("/supervisor/vacaciones/todas", authMiddleware, async (req, res) => {
    try {
        const vacaciones = await getTodasVacaciones();
        res.json({ success: true, data: vacaciones });
    } catch (error) {
        console.error("Error en /supervisor/vacaciones/todas:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
router.get("/evaluaciones/:id/word", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const evaluacion = await getEvaluacionById(id);
        if (!evaluacion) {
            return res
                .status(404)
                .json({ success: false, message: "Evaluación no encontrada" });
        }

        const buffer = await generarWordEvaluacion(evaluacion);

        const nombreArchivo = `evaluacion_${evaluacion.empleado_apPaterno || "empleado"}_${id}.docx`;

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${nombreArchivo}"`,
        );
        res.send(buffer);
    } catch (error) {
        console.error("Error al generar Word:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
// GET /api/rh/notificaciones — lista notificaciones pendientes por usuario RH
router.get('/rh/notificaciones', authMiddleware, soloRH, async (req, res) => {
    try {
        const lectorUsuarioId = req.user?.usuarioId;
        const soloNoLeidas = req.query.noLeidas === 'true';
        const generar = req.query.generar !== 'false';

        if (!lectorUsuarioId) {
            return res.status(401).json({
                success: false,
                message: 'Usuario autenticado no válido',
            });
        }

        const notificaciones = await getNotificacionesRH(soloNoLeidas, {
            generar,
            lectorUsuarioId,
        });

        return res.json({
            success: true,
            data: notificaciones,
            total: notificaciones.length,
        });
    } catch (error) {
        console.error('[GET /rh/notificaciones]', error);

        return res.status(500).json({
            success: false,
            message: error.message || 'Error al obtener notificaciones RH',
        });
    }
});

/// GET /api/rh/notificaciones/count — badge contador por usuario RH
router.get('/rh/notificaciones/count', authMiddleware, soloRH, async (req, res) => {
    try {
        const lectorUsuarioId = req.user?.usuarioId;

        if (!lectorUsuarioId) {
            return res.status(401).json({
                success: false,
                message: 'Usuario autenticado no válido',
            });
        }

        await generarNotificacionesPendientesRH({ enviarPush: false });

        const total = await contarNoLeidas(lectorUsuarioId);

        return res.json({
            success: true,
            data: { total },
        });
    } catch (error) {
        console.error('[GET /rh/notificaciones/count]', error);

        return res.status(500).json({
            success: false,
            message: error.message || 'Error al contar notificaciones RH',
        });
    }
});
// PATCH /api/rh/notificaciones/leer-todas — se conserva para uso futuro, pero por usuario RH
router.patch('/rh/notificaciones/leer-todas', authMiddleware, soloRH, async (req, res) => {
    try {
        const lectorUsuarioId = req.user?.usuarioId;

        if (!lectorUsuarioId) {
            return res.status(401).json({
                success: false,
                message: 'Usuario autenticado no válido',
            });
        }

        const result = await marcarTodasComoLeidas(lectorUsuarioId);

        return res.json(result);
    } catch (error) {
        console.error('[PATCH /rh/notificaciones/leer-todas]', error);

        return res.status(500).json({
            success: false,
            message: error.message || 'Error al marcar todas como leídas',
        });
    }
});

// PATCH /api/rh/notificaciones/:id/leer — marcar una notificación como leída solo para este usuario RH
router.patch('/rh/notificaciones/:id/leer', authMiddleware, soloRH, async (req, res) => {
    try {
        const lectorUsuarioId = req.user?.usuarioId;
        const id = Number(req.params.id);

        if (!lectorUsuarioId) {
            return res.status(401).json({
                success: false,
                message: 'Usuario autenticado no válido',
            });
        }

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'ID inválido',
            });
        }

        const result = await marcarComoLeida(id, lectorUsuarioId);

        return res.json(result);
    } catch (error) {
        console.error('[PATCH /rh/notificaciones/:id/leer]', error);

        return res.status(500).json({
            success: false,
            message: error.message || 'Error al marcar notificación como leída',
        });
    }
});

router.get("/departamentos", async (req, res) => {
    try {
        const departamentos = await getDepartamentos();
        res.json({ success: true, data: departamentos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// GET /api/rh/notificaciones/generar-todos — solo para inicializar
router.get('/rh/notificaciones/generar-todos', authMiddleware, soloRH, async (req, res) => {
    try {
        const result = await generarNotificaciones();
        return res.json(result);
    } catch (error) {
        console.error('[GET /rh/notificaciones/generar-todos]', error);

        return res.status(500).json({
            success: false,
            message: error.message || 'Error al generar notificaciones',
        });
    }
});
// POST /api/rh/notificaciones/generar-pendientes
router.post('/rh/notificaciones/generar-pendientes', authMiddleware, soloRH, async (req, res) => {
    try {
        const enviarPush = req.body?.enviarPush === true;

        const result = await generarNotificacionesPendientesRH({
            enviarPush,
        });

        return res.json(result);
    } catch (error) {
        console.error('[POST /rh/notificaciones/generar-pendientes]', error);

        return res.status(500).json({
            success: false,
            message: error.message || 'Error al generar notificaciones RH',
        });
    }
});
// GET /api/rh/cumpleanos — cumpleaños del mes actual agrupados por día
router.get("/rh/cumpleanos", authMiddleware, async (req, res) => {
    try {
        const mes = req.query.mes
            ? Number(req.query.mes)
            : new Date().getMonth() + 1;
        const rows = await new Promise((resolve, reject) => {
            connection.query(
                `
                SELECT
                    usuarioId, nombre, apPaterno, apMaterno,
                    foto, fecha_nacimiento,
                    DAY(fecha_nacimiento)   AS dia,
                    MONTH(fecha_nacimiento) AS mes,
                    YEAR(fecha_nacimiento)  AS anio,
                    TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) AS edad,
                    departamento, nombre_puesto
                FROM usuarios u
                LEFT JOIN puesto p ON u.puestoId = p.puestoId
                WHERE MONTH(fecha_nacimiento) = ?
                  AND fecha_nacimiento IS NOT NULL
                ORDER BY DAY(fecha_nacimiento)
            `,
                [mes],
                (err, results) => (err ? reject(err) : resolve(results)),
            );
        });
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/rh/cumpleanos/manana — para el badge/notificación
router.get("/rh/cumpleanos/manana", authMiddleware, async (req, res) => {
    try {
        const rows = await new Promise((resolve, reject) => {
            connection.query(
                `
                SELECT
                    usuarioId, nombre, apPaterno, apMaterno,
                    foto, fecha_nacimiento, departamento,
                    TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) + 1 AS edad
                FROM usuarios u
                WHERE DAY(fecha_nacimiento)   = DAY(DATE_ADD(CURDATE(), INTERVAL 1 DAY))
                  AND MONTH(fecha_nacimiento) = MONTH(DATE_ADD(CURDATE(), INTERVAL 1 DAY))
                  AND fecha_nacimiento IS NOT NULL
            `,
                (err, results) => (err ? reject(err) : resolve(results)),
            );
        });
        res.json({ success: true, data: rows, total: rows.length });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
router.get("/rh/vacaciones/:id/excel", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const rows = await new Promise((resolve, reject) => {
            connection.query(
                `SELECT v.*,
                    u.nombre, u.apPaterno, u.apMaterno,
                    u.usuarioId, u.departamento, u.fechaContratacion,
                    p.nombre_puesto,
                    TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) AS anios_servicio,
                    -- Días LFT según antigüedad
                    CASE
                        WHEN TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) >= 25 THEN 32
                        WHEN TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) >= 20 THEN 30
                        WHEN TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) >= 15 THEN 28
                        WHEN TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) >= 10 THEN 24
                        WHEN TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) >= 5  THEN 18
                        WHEN TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) >= 4  THEN 16
                        WHEN TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) >= 3  THEN 14
                        WHEN TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) >= 2  THEN 10
                        WHEN TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) >= 1  THEN 8
                    ELSE 0
                    END AS dias_vacaciones_lft,
                    -- Días usados en el año actual
                    COALESCE((
                        SELECT SUM(dias_solicitados) FROM vacaciones
                        WHERE usuarioId = u.usuarioId
                        AND estado_final = 'Aceptadas'
                         AND YEAR(fecha_inicio_vacaciones) = YEAR(CURDATE())
                    ), 0) AS dias_usados
                    FROM vacaciones v
                    LEFT JOIN usuarios u ON v.usuarioId = u.usuarioId
                    LEFT JOIN puesto   p ON u.puestoId  = p.puestoId
                    WHERE v.vacacionesId = ?`,
                [id],
                (err, r) => (err ? reject(err) : resolve(r)),
            );
        });
        const row = rows[0];
        row.dias_restantes = (row.dias_vacaciones_lft || 0) - (row.dias_usados || 0);

        if (!rows.length)
            return res
                .status(404)
                .json({ success: false, message: "Vacación no encontrada" });

        const buffer = await generarExcelVacaciones(rows[0]);
        const nombre = `vacaciones_${rows[0].apPaterno || "empleado"}_${id}.xlsx`;

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// Empleado solicita permiso
router.post('/empleados/permisos', authMiddleware, async (req, res) => {
    try {
        const result = await crearPermiso(req.user.usuarioId, req.body);
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Empleado ve sus permisos
router.get('/empleados/permisos', authMiddleware, async (req, res) => {
    try {
        const permisos = await getPermisosByEmpleado(req.user.usuarioId);
        res.json({ success: true, data: permisos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// RH/Supervisor ve todos los permisos
router.get('/rh/permisos', authMiddleware, async (req, res) => {
    try {
        const permisos = await getTodosPermisos();
        res.json({ success: true, data: permisos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// RH responde permiso
router.patch('/rh/permisos/:id/responder', authMiddleware, async (req, res) => {
    try {
        const { estado } = req.body;
        if (!['autorizado', 'rechazado'].includes(estado))
            return res.status(400).json({ success: false, message: 'Estado inválido' });
        const result = await responderPermiso(Number(req.params.id), estado);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Descargar Word del permiso
router.get('/rh/permisos/:id/word', authMiddleware, async (req, res) => {
    try {
        const permiso = await getPermisoById(Number(req.params.id));
        if (!permiso) return res.status(404).json({ success: false, message: 'Permiso no encontrado' });
        const buffer = await generarWordPermiso(permiso);
        const nombre = `permiso_${permiso.apPaterno || 'empleado'}_${req.params.id}.docx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Eliminar permiso
router.delete('/rh/permisos/:id', authMiddleware, async (req, res) => {
    try {
        const result = await deletePermiso(Number(req.params.id));
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// Guardar vehículo
router.post('/rh/empleados/:id/vehiculo', authMiddleware, async (req, res) => {
    try {
        const result = await upsertVehiculo(Number(req.params.id), req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Agregar hijo
router.post('/rh/empleados/:id/hijos', authMiddleware, async (req, res) => {
    try {
        const { nombre, fecha_nacimiento } = req.body;
        const result = await addHijo(Number(req.params.id), nombre, fecha_nacimiento);
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
//Descuento
router.get('/rh/empleados/:id/descuentos', authMiddleware, async (req, res) => {
    try {
        const rows = await new Promise((resolve, reject) => {
            connection.query(
                'SELECT * FROM descuentos WHERE usuarioId = ? ORDER BY descuentoId',
                [req.params.id], (err, r) => err ? reject(err) : resolve(r)
            );
        });
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
router.post('/rh/empleados/:id/descuentos', authMiddleware, async (req, res) => {
    try {
        const { descuentos } = req.body;
        if (!Array.isArray(descuentos) || descuentos.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No se enviaron descuentos'
            });
        }
        const inserts = [];
        for (const d of descuentos) {
            if (
                !d.concepto ||
                d.monto === undefined ||
                d.monto === null ||
                d.monto === ''
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'Faltan campos'
                });
            }
            const result = await new Promise((resolve, reject) => {
                connection.query(
                    ` INSERT INTO descuentos ( usuarioId, concepto, monto, tipo, periodicidad, activo ) VALUES (?, ?, ?, ?, ?, 1) `,
                    [req.params.id, d.concepto, Number(d.monto), d.tipo || 'descuento', d.periodicidad || 'quincena'],
                    (err, r) => err ? reject(err) : resolve(r)
                );
            });
            inserts.push(result);
        }
        res.status(201).json({
            success: true,
            message: 'Descuentos guardados correctamente'
        });
    } catch (error) {
        console.error(error); res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

router.delete('/rh/descuentos/:id', authMiddleware, async (req, res) => {
    try {
        await new Promise((resolve, reject) => {
            connection.query('DELETE FROM descuentos WHERE descuentoId = ?',
                [req.params.id], (err) => err ? reject(err) : resolve(null));
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
//Historial de bajas
router.get('/rh/bajas', authMiddleware, async (req, res) => {
    try {
        const rows = await new Promise((resolve, reject) => {
            connection.query(`
                SELECT b.*, u.nombre AS rh_nombre, u.apPaterno AS rh_apPaterno
                FROM bajas b
                LEFT JOIN usuarios u ON b.registrado_por = u.usuarioId
                ORDER BY b.fecha_baja DESC
            `, (err, r) => err ? reject(err) : resolve(r));
        });
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Eliminar hijo
router.delete('/rh/hijos/:id', authMiddleware, async (req, res) => {
    try {
        const result = await deleteHijo(Number(req.params.id));
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// GET /api/rh/cumpleanos/hijos — cumpleaños de hijos del mes
router.get('/rh/cumpleanos/hijos', authMiddleware, async (req, res) => {
    try {
        const mes = req.query.mes ? Number(req.query.mes) : new Date().getMonth() + 1;
        const rows = await new Promise((resolve, reject) => {
            connection.query(`
                SELECT
                    h.hijoId, h.nombre, h.fecha_nacimiento,
                    DAY(h.fecha_nacimiento)   AS dia,
                    MONTH(h.fecha_nacimiento) AS mes,
                    TIMESTAMPDIFF(YEAR, h.fecha_nacimiento, CURDATE()) AS edad,
                    u.nombre        AS padre_nombre,
                    u.apPaterno     AS padre_apPaterno,
                    u.apMaterno     AS padre_apMaterno,
                    u.departamento,
                    u.foto
                FROM hijos h
                LEFT JOIN usuarios u ON h.usuarioId = u.usuarioId
                WHERE MONTH(h.fecha_nacimiento) = ?
                  AND h.fecha_nacimiento IS NOT NULL
                ORDER BY DAY(h.fecha_nacimiento)
            `, [mes], (err, r) => err ? reject(err) : resolve(r));
        });
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/rh/cumpleanos/hijos/manana
router.get('/rh/cumpleanos/hijos/manana', authMiddleware, async (req, res) => {
    try {
        const rows = await new Promise((resolve, reject) => {
            connection.query(`
                SELECT
                    h.hijoId, h.nombre, h.fecha_nacimiento,
                    TIMESTAMPDIFF(YEAR, h.fecha_nacimiento, CURDATE()) + 1 AS edad,
                    u.nombre    AS padre_nombre,
                    u.apPaterno AS padre_apPaterno,
                    u.departamento, u.foto
                FROM hijos h
                LEFT JOIN usuarios u ON h.usuarioId = u.usuarioId
                WHERE DAY(h.fecha_nacimiento)   = DAY(DATE_ADD(CURDATE(), INTERVAL 1 DAY))
                  AND MONTH(h.fecha_nacimiento) = MONTH(DATE_ADD(CURDATE(), INTERVAL 1 DAY))
                  AND h.fecha_nacimiento IS NOT NULL
            `, (err, r) => err ? reject(err) : resolve(r));
        });
        res.json({ success: true, data: rows, total: rows.length });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// ── Cambio de contraseña — cualquier usuario autenticado ────
router.patch('/usuarios/cambiar-contrasena', authMiddleware, async (req, res) => {
    try {
        const { contrasenaActual, contrasenaNueva } = req.body;
        const usuarioId = req.user.usuarioId;

        if (!contrasenaActual || !contrasenaNueva)
            return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });

        if (contrasenaNueva.length < 6)
            return res.status(400).json({ success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres' });

        // Verificar contraseña actual
        const rows = await new Promise((resolve, reject) => {
            connection.query('SELECT contrasenia FROM usuarios WHERE usuarioId = ?',
                [usuarioId], (err, r) => err ? reject(err) : resolve(r));
        });

        if (!rows.length)
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

        const match = await bcrypt.compare(contrasenaActual, rows[0].contrasenia);
        if (!match)
            return res.status(401).json({ success: false, message: 'La contraseña actual es incorrecta' });

        // Guardar nueva contraseña
        const hash = await bcrypt.hash(contrasenaNueva, 10);
        await new Promise((resolve, reject) => {
            connection.query('UPDATE usuarios SET contrasenia = ? WHERE usuarioId = ?',
                [hash, usuarioId], (err) => err ? reject(err) : resolve(null));
        });

        res.json({ success: true, message: 'Contraseña actualizada correctamente' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Exportación general o por sección
router.get('/rh/exportar-bd', authMiddleware, async (req, res) => {
    try {
        const seccion = req.query.seccion || 'general';
        const buffer = await generarExcelBD(seccion);
        await registrarLog(
            req.user?.usuarioId,
            req.user?.usuario,
            req.ip || req.headers['x-forwarded-for'] || null
        );
        const fecha = new Date().toISOString().split('T')[0];
        const nombreArchivo = `DIAGSA_${String(seccion).toUpperCase()}_${fecha}.xlsx`;
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${nombreArchivo}"`
        );
        res.send(buffer);
    } catch (error) {
        console.error('Error al exportar BD:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error al exportar base de datos',
        });
    }
});
// Exportación de datos para contrato por empleado
router.get('/rh/exportar-bd/contrato/:usuarioId', authMiddleware, async (req, res) => {
    try {
        const { usuarioId } = req.params;
        const buffer = await generarExcelContrato(usuarioId);
        await registrarLog(
            req.user?.usuarioId,
            req.user?.usuario,
            req.ip || req.headers['x-forwarded-for'] || null
        );
        const fecha = new Date().toISOString().split('T')[0];
        const nombreArchivo = `DIAGSA_CONTRATO_${usuarioId}_${fecha}.xlsx`;
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${nombreArchivo}"`
        );
        res.send(buffer);
    } catch (error) {
        console.error('Error al exportar contrato:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error al exportar datos de contrato',
        });
    }
});
router.get('/rh/exportar-bd/logs', authMiddleware, async (req, res) => {
    try {
        const logs = await getExportLogs();
        res.json({
            success: true,
            data: logs,
        });
    } catch (error) {
        console.error('Error al obtener logs de exportación:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error al obtener historial de exportaciones',
        });
    }
});
//rutas mandos (Gerente / Supervisor)
router.post('/mandos/vacantes', authMiddleware, soloMandos, async (req, res) => {
    try {
        res.json(await solicitarVacante(req.user.usuarioId, req.body));
    } catch (error) {
        res.status(500).json({ error: error.message });
    };
});
router.get('/mandos/vacantes', authMiddleware, soloMandos, async (req, res) => {
    try {
        res.json(await getVacantesSolicitante(req.user.usuarioId));
    } catch (error) {
        res.status(500).json({ error: error.message });
    };
});
//Rutas vacantes RH
router.get('/rh/vacantes', authMiddleware, soloRH, async (req, res) => {
    try {
        res.json(await getAllVacantes());
    } catch (error) {
        res.status(500).json({ error: error.message });
    };
});
router.put('/rh/vacantes/:id/gestionar', authMiddleware, soloRH, async (req, res) => {
    try {
        res.json(await gestionarVacanteRH(req.params.id, req.body));
    } catch (error) {
        res.status(500).json({ error: error.message });
    };
});
router.delete('/rh/vacantes/:id', authMiddleware, soloRH, async (req, res) => {
    try {
        res.json(await deleteVacante(req.params.id));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post('/rh/empleados/:id/descuentos', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { sueldo_neto, descuentos = [] } = req.body;
    try {
        await connection.beginTransaction();
        if (sueldo_neto !== undefined && sueldo_neto !== null && sueldo_neto !== '') {
            await query('UPDATE usuarios SET sueldo_neto = ? WHERE usuarioId = ?', [
                Number(sueldo_neto),
                id,
            ]);
        }
        for (const d of descuentos) {
            await query(`
                INSERT INTO descuentos (
                    usuarioId, concepto, monto, tipo, periodicidad, activo
                ) VALUES (?, ?, ?, ?, ?, 1)
            `, [
                id,
                d.concepto,
                d.monto,
                d.tipo || 'descuento',
                d.periodicidad || 'quincena',
            ]);
        }
        await connection.commit();
        return res.json({ success: true, message: 'Deducciones guardadas' });
    } catch (error) {
        await connection.rollback();
        return res.status(500).json({ success: false, message: 'No se pudo guardar' });
    }
});
//Endpoints documentos RH
//Acta adminiiistratiiva
router.post('/rh/empleados/:id/actas-administrativas', authMiddleware, async (req, res) => {
    try {
        const { fecha, hora, falta, fraccion_art47, declaracion, sancion, observaciones,
        } = req.body;
        if (!fecha || !falta) {
            return res.status(400).json({
                success: false,
                message: 'Fecha y falta son requeridas',
            });
        }
        const registradoPor = req.user?.usuarioId || null;
        const result = await new Promise((resolve, reject) => {
            connection.query(` INSERT INTO actas_administrativas (
                    usuarioId,
                    fecha,
                    hora,
                    falta,
                    fraccion_art47,
                    declaracion,
                    sancion,
                    observaciones,
                    registrado_por
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) `,
                [
                    req.params.id,
                    fecha,
                    hora || null,
                    falta,
                    fraccion_art47 || null,
                    declaracion || null,
                    sancion || null,
                    observaciones || null,
                    registradoPor,
                ],
                (err, r) => err ? reject(err) : resolve(r)
            );
        });
        res.status(201).json({
            success: true,
            message: 'Acta administrativa registrada correctamente',
            actaId: result.insertId,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
//Carta compromiso
router.post('/rh/empleados/:id/cartas-compromiso', authMiddleware, async (req, res) => {
    try {
        const { fecha, asunto, descripcion, } = req.body;
        if (!fecha || !asunto) {
            return res.status(400).json({
                success: false,
                message: 'Fecha y asunto son requeridos',
            });
        }
        const registradoPor = req.user?.usuarioId || null;
        const result = await new Promise((resolve, reject) => {
            connection.query(` INSERT INTO cartas_compromiso (
                    usuarioId,
                    fecha,
                    asunto,
                    descripcion,
                    registrado_por
                ) VALUES (?, ?, ?, ?, ?) `,
                [
                    req.params.id,
                    fecha,
                    asunto,
                    descripcion || null,
                    registradoPor,
                ],
                (err, r) => err ? reject(err) : resolve(r)
            );
        });
        res.status(201).json({
            success: true,
            message: 'Carta compromiso registrada correctamente',
            cartaId: result.insertId,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
//Responsiva EPP
router.post('/rh/empleados/:id/responsivas-epp', authMiddleware, async (req, res) => {
    try {
        const { fecha, lugar, observaciones, items, } = req.body;
        if (!fecha) {
            return res.status(400).json({
                success: false,
                message: 'La fecha es requerida',
            });
        }
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Agrega al menos un equipo o artículo',
            });
        }
        const registradoPor = req.user?.usuarioId || null;
        const result = await new Promise((resolve, reject) => {
            connection.query(`INSERT INTO responsivas_epp (
                    usuarioId,
                    fecha,
                    lugar,
                    observaciones,
                    registrado_por
                ) VALUES (?, ?, ?, ?, ?) `,
                [
                    req.params.id,
                    fecha,
                    lugar || null,
                    observaciones || null,
                    registradoPor,
                ],
                (err, r) => err ? reject(err) : resolve(r)
            );
        });
        const responsivaId = result.insertId;
        for (const item of items) {
            if (!item.descripcion) continue;
            await new Promise((resolve, reject) => {
                connection.query(` INSERT INTO responsivas_epp_items (
                        responsivaId,
                        cantidad,
                        descripcion,
                        marca_modelo,
                        estado
                    ) VALUES (?, ?, ?, ?, ?) `,
                    [
                        responsivaId,
                        Number(item.cantidad) || 1,
                        item.descripcion,
                        item.marca_modelo || null,
                        item.estado || null,
                    ],
                    (err, r) => err ? reject(err) : resolve(r)
                );
            });
        }
        res.status(201).json({
            success: true,
            message: 'Responsiva registrada correctamente',
            responsivaId,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
//Historial del empledo
router.get('/rh/empleados/:id/historial-rh', authMiddleware, async (req, res) => {
    try {
        const usuarioId = req.params.id
        const actas = await new Promise((resolve, reject) => {
            connection.query(`
                SELECT 
                    a.*,
                    u.usuario AS registrado_por_usuario
                FROM actas_administrativas a
                LEFT JOIN usuarios u ON a.registrado_por = u.usuarioId
                WHERE a.usuarioId = ?
                ORDER BY a.fecha DESC, a.createdAt DESC
                `,
                [usuarioId],
                (err, r) => err ? reject(err) : resolve(r)
            );
        });
        const cartas = await new Promise((resolve, reject) => {
            connection.query(`
                SELECT 
                    c.*,
                    u.usuario AS registrado_por_usuario
                FROM cartas_compromiso c
                LEFT JOIN usuarios u ON c.registrado_por = u.usuarioId
                WHERE c.usuarioId = ?
                ORDER BY c.fecha DESC, c.createdAt DESC `,
                [usuarioId],
                (err, r) => err ? reject(err) : resolve(r)
            );
        });
        const responsivas = await new Promise((resolve, reject) => {
            connection.query(`
                SELECT 
                    r.*,
                    u.usuario AS registrado_por_usuario
                FROM responsivas_epp r
                LEFT JOIN usuarios u ON r.registrado_por = u.usuarioId
                WHERE r.usuarioId = ?
                ORDER BY r.fecha DESC, r.createdAt DESC `,
                [usuarioId],
                (err, r) => err ? reject(err) : resolve(r)
            );
        });
        for (const r of responsivas) {
            const items = await new Promise((resolve, reject) => {
                connection.query(`
                    SELECT *
                    FROM responsivas_epp_items
                    WHERE responsivaId = ?
                    ORDER BY itemId `,
                    [r.responsivaId],
                    (err, rows) => err ? reject(err) : resolve(rows)
                );
            });
            r.items = items;
        }
        res.json({
            success: true,
            data: {
                actas,
                cartas,
                responsivas,
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
router.get('/rh/admin/usuarios/:usuarioId/accesos', authMiddleware, soloRHAdmin, async (req, res) => {
    try {
        const rows = await query(`
            SELECT
                ua.accesoId,
                ua.usuarioId,
                ua.sucursalId,
                s.nombre_sucursal AS nombre_sucursal,
                ua.departamentoId,
                d.nombre AS nombre_departamento,
                ua.tipo_acceso,
                ua.activo
            FROM usuario_accesos ua
            LEFT JOIN sucursales s ON ua.sucursalId = s.sucursalId
            LEFT JOIN departamentos d ON ua.departamentoId = d.departamentoId
            WHERE ua.usuarioId = ?
              AND ua.activo = 1
            ORDER BY s.nombre_sucursal, d.nombre
        `, [req.params.usuarioId]);

        res.json({
            success: true,
            data: rows,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
// Sucursales
router.get('/catalogos/sucursales', authMiddleware, async (req, res) => {
    try {
        const rows = await query(`
            SELECT 
                sucursalId,
                nombre_sucursal AS nombre
            FROM sucursales
            ORDER BY nombre_sucursal
        `);

        res.json({
            success: true,
            data: rows,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
// Departamentos por sucursal
router.get('/catalogos/sucursales/:sucursalId/departamentos', authMiddleware, async (req, res) => {
    try {
        const rows = await query(`
            SELECT
                d.departamentoId,
                d.nombre
            FROM sucursal_departamento sd
            INNER JOIN departamentos d ON sd.departamentoId = d.departamentoId
            WHERE sd.sucursalId = ?
            ORDER BY d.nombre
        `, [req.params.sucursalId]);

        res.json({
            success: true,
            data: rows,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
// Puestos por departamento
router.get('/catalogos/departamentos/:departamentoId/puestos', authMiddleware, async (req, res) => {
    try {
        const rows = await query(`
            SELECT
                puestoId,
                nombre_puesto
            FROM puesto
            WHERE departamentoId = ?
            ORDER BY nombre_puesto
        `, [req.params.departamentoId]);

        res.json({
            success: true,
            data: rows,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
router.get('/rh/admin/usuarios-acceso', authMiddleware, soloRHAdmin, async (req, res) => {
    try {
        const rows = await query(`
            SELECT
                u.usuarioId,
                u.nombre,
                u.apPaterno,
                u.apMaterno,
                u.usuario,
                u.rolId,
                r.nombre_rol,
                u.sucursalId,
                s.nombre_sucursal AS nombre_sucursal,
                u.departamentoId,
                d.nombre AS nombre_departamento
            FROM usuarios u
            LEFT JOIN roles r ON u.rolId = r.rolId
            LEFT JOIN sucursales s ON u.sucursalId = s.sucursalId
            LEFT JOIN departamentos d ON u.departamentoId = d.departamentoId
            WHERE u.rolId IN (1, 2, 3, 7)
            ORDER BY u.rolId, u.apPaterno, u.nombre
        `);

        res.json({
            success: true,
            data: rows,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
router.post('/rh/empleados/:id/documentos', authMiddleware, soloRH, uploadPDF.fields([
    { name: 'pdf_rfc', maxCount: 1 },
    { name: 'pdf_psicometrico', maxCount: 1 },
]),
    async (req, res) => {
        try {
            const { id } = req.params;
            const archivos = req.files || {};
            const pdfRfc = archivos.pdf_rfc?.[0] || null;
            const pdfPsicometrico = archivos.pdf_psicometrico?.[0] || null;
            if (!pdfRfc && !pdfPsicometrico) {
                return res.status(400).json({
                    success: false,
                    message: 'No se enviaron documentos',
                });
            }
            const updates = [];
            const values = [];
            const respuesta = {};
            if (pdfRfc) {
                const urlRfc = await subirPDF(
                    pdfRfc.buffer,
                    `diagsa/empleados/${id}/documentos`,
                    `rfc_${id}`
                );
                updates.push('pdf_rfc = ?');
                values.push(urlRfc);
                respuesta.pdf_rfc = urlRfc;
            }
            if (pdfPsicometrico) {
                const urlPsicometrico = await subirPDF(
                    pdfPsicometrico.buffer,
                    `diagsa/empleados/${id}/documentos`,
                    `psicometrico_${id}`
                );
                updates.push('pdf_psicometrico = ?');
                values.push(urlPsicometrico);
                respuesta.pdf_psicometrico = urlPsicometrico;
            }
            values.push(id);
            await query(`
                UPDATE usuarios
                SET ${updates.join(', ')}
                WHERE usuarioId = ?
            `, values);
            res.json({
                success: true,
                message: 'Documentos guardados correctamente',
                data: respuesta,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }
);
router.post('/rh/empleados/:id/vehiculos', authMiddleware, soloRH, async (req, res) => {
    try {
        const { id } = req.params;
        const { tipo, marca, modelo, anio, color, placas, num_serie, } = req.body;
        if (!tipo && !marca && !modelo && !placas && !num_serie) {
            return res.status(400).json({
                success: false,
                message: 'Agrega al menos un dato del vehículo',
            });
        }
        const result = await query(`
            INSERT INTO vehiculos (
                usuarioId,
                tiene_vehiculo,
                tipo,
                marca,
                modelo,
                anio,
                color,
                placas,
                num_serie
            )
            VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id,
            tipo || null,
            marca || null,
            modelo || null,
            anio ? Number(anio) : null,
            color || null,
            placas || null,
            num_serie || null,
        ])
        res.status(201).json({
            success: true,
            message: 'Vehículo agregado correctamente',
            vehiculoId: result.insertId,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
router.patch('/rh/vehiculos/:vehiculoId', authMiddleware, soloRH, async (req, res) => {
    try {
        const { vehiculoId } = req.params;
        const { tipo, marca, modelo, anio, color, placas, num_serie, } = req.body;
        await query(`
            UPDATE vehiculos
            SET
                tiene_vehiculo = 1,
                tipo = ?,
                marca = ?,
                modelo = ?,
                anio = ?,
                color = ?,
                placas = ?,
                num_serie = ?
            WHERE vehiculoId = ?
        `, [
            tipo || null,
            marca || null,
            modelo || null,
            anio ? Number(anio) : null,
            color || null,
            placas || null,
            num_serie || null,
            vehiculoId,
        ]);
        res.json({
            success: true,
            message: 'Vehículo actualizado correctamente',
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
router.delete('/rh/vehiculos/:vehiculoId', authMiddleware, soloRH, async (req, res) => {
    try {
        const { vehiculoId } = req.params;
        await query(`
            UPDATE vehiculos
            SET tiene_vehiculo = 0
            WHERE vehiculoId = ?
        `, [vehiculoId]);
        res.json({
            success: true,
            message: 'Vehículo eliminado correctamente',
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
router.post('/rh/admin/usuarios/:usuarioId/accesos', authMiddleware, soloRHAdmin, async (req, res) => {
    try {
        const { usuarioId } = req.params;
        const { accesos } = req.body;

        if (!Array.isArray(accesos)) {
            return res.status(400).json({
                success: false,
                message: 'Formato de accesos inválido',
            });
        }

        const existeUsuario = await query(
            'SELECT usuarioId FROM usuarios WHERE usuarioId = ? LIMIT 1',
            [usuarioId]
        );

        if (existeUsuario.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado',
            });
        }

        await query('DELETE FROM usuario_accesos WHERE usuarioId = ?', [usuarioId]);

        for (const acceso of accesos) {
            if (!acceso.sucursalId) continue;

            await query(`
                INSERT INTO usuario_accesos (
                    usuarioId,
                    sucursalId,
                    departamentoId,
                    tipo_acceso,
                    activo
                )
                VALUES (?, ?, ?, ?, 1)
            `, [
                Number(usuarioId),
                Number(acceso.sucursalId),
                acceso.departamentoId ? Number(acceso.departamentoId) : null,
                acceso.departamentoId ? 'departamento' : 'sucursal',
            ]);
        }

        return res.json({
            success: true,
            message: 'Accesos actualizados correctamente',
        });
    } catch (error) {
        console.error('[POST /rh/admin/usuarios/:usuarioId/accesos]', error);

        return res.status(500).json({
            success: false,
            message: error.message || 'Error al actualizar accesos',
        });
    }
});
router.get('/debug/routes', (req, res) => {
    const routes = [];

    router.stack.forEach((layer) => {
        if (layer.route && layer.route.path) {
            routes.push({
                path: layer.route.path,
                methods: Object.keys(layer.route.methods),
            });
        }
    });
    res.json({
        success: true,
        total: routes.length,
        routes,
    });
});;
router.patch('/usuarios/induccion/completar', authMiddleware, async (req, res) => {
    try {
        const usuarioId = req.user.usuarioId;

        await query(`
            UPDATE usuarios
            SET induccion_completada = 1,
                fecha_induccion = NOW()
            WHERE usuarioId = ?
        `, [usuarioId]);

        return res.json({
            success: true,
            message: 'Inducción completada correctamente',
        });
    } catch (error) {
        console.error('[PATCH /usuarios/induccion/completar]', error);

        return res.status(500).json({
            success: false,
            message: error.message || 'Error al completar inducción',
        });
    }
});
router.get('/push/vapid-public-key', authMiddleware, async (req, res) => {
    try {
        if (!VAPID_PUBLIC_KEY) {
            return res.status(500).json({
                success: false,
                message: 'Falta VAPID_PUBLIC_KEY en variables de entorno',
            });
        }

        return res.json({
            success: true,
            data: {
                publicKey: VAPID_PUBLIC_KEY,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || 'Error al obtener llave pública VAPID',
        });
    }
});

router.post('/push/subscribe', authMiddleware, async (req, res) => {
    try {
        const usuarioId = req.user.usuarioId;
        const { subscription } = req.body;

        const result = await guardarSuscripcionPush(
            usuarioId,
            subscription,
            req.headers['user-agent'] || null
        );

        return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        console.error('[POST /push/subscribe]', error);

        return res.status(500).json({
            success: false,
            message: error.message || 'Error al guardar suscripción push',
        });
    }
});

router.post('/push/test', authMiddleware, async (req, res) => {
    try {
        const usuarioId = req.user.usuarioId;

        const result = await enviarPushAUsuario(usuarioId, {
            titulo: req.body?.titulo || 'Notificación de prueba',
            mensaje: req.body?.mensaje || 'Las notificaciones push están funcionando correctamente.',
            url: req.body?.url || '/',
        });

        return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        console.error('[POST /push/test]', error);

        return res.status(500).json({
            success: false,
            message: error.message || 'Error al enviar notificación de prueba',
        });
    }
});

router.post('/push/usuario/:usuarioId', authMiddleware, soloRH, async (req, res) => {
    try {
        const { usuarioId } = req.params;
        const { titulo, mensaje, url } = req.body;

        if (!titulo || !mensaje) {
            return res.status(400).json({
                success: false,
                message: 'titulo y mensaje son requeridos',
            });
        }

        const result = await enviarPushAUsuario(Number(usuarioId), {
            titulo,
            mensaje,
            url: url || '/',
        });

        return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        console.error('[POST /push/usuario/:usuarioId]', error);

        return res.status(500).json({
            success: false,
            message: error.message || 'Error al enviar notificación',
        });
    }
});

router.post('/push/rol/:rolId', authMiddleware, soloRH, async (req, res) => {
    try {
        const { rolId } = req.params;
        const { titulo, mensaje, url } = req.body;

        if (!titulo || !mensaje) {
            return res.status(400).json({
                success: false,
                message: 'titulo y mensaje son requeridos',
            });
        }

        const result = await enviarPushARol(Number(rolId), {
            titulo,
            mensaje,
            url: url || '/',
        });

        return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        console.error('[POST /push/rol/:rolId]', error);

        return res.status(500).json({
            success: false,
            message: error.message || 'Error al enviar notificaciones por rol',
        });
    }
});

router.get('/push/logs', authMiddleware, soloRH, async (req, res) => {
    try {
        const logs = await getPushLogs(null, req.query.limit || 50);

        return res.json({
            success: true,
            data: logs,
        });
    } catch (error) {
        console.error('[GET /push/logs]', error);

        return res.status(500).json({
            success: false,
            message: error.message || 'Error al obtener logs push',
        });
    }
});

module.exports = router;
