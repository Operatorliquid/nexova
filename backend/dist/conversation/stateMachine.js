"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleConversationFlow = handleConversationFlow;
const client_1 = require("@prisma/client");
const text_1 = require("../utils/text");
async function handleConversationFlow(ctx) {
    if (ctx.businessType !== "HEALTH") {
        return { handled: false };
    }
    const trimmed = (ctx.incomingText || "").trim();
    if (!trimmed) {
        return { handled: false };
    }
    const normalized = trimmed.toLowerCase();
    const data = parseStateData(ctx.patient.conversationStateData);
    const state = resolveState(ctx.patient, data);
    const isOnboardingState = state === client_1.ConversationState.PROFILE_DNI ||
        state === client_1.ConversationState.PROFILE_NAME ||
        state === client_1.ConversationState.PROFILE_BIRTHDATE ||
        state === client_1.ConversationState.PROFILE_ADDRESS ||
        state === client_1.ConversationState.PROFILE_INSURANCE ||
        state === client_1.ConversationState.PROFILE_REASON;
    if (isGenericAcknowledgement(trimmed) &&
        !ctx.patient.needsDni &&
        !ctx.patient.needsName &&
        !ctx.patient.needsBirthDate &&
        !ctx.patient.needsAddress &&
        !ctx.patient.needsInsurance &&
        !ctx.patient.needsConsultReason &&
        (state === client_1.ConversationState.BOOKING_MENU ||
            state === client_1.ConversationState.FREE_CHAT)) {
        return {
            handled: true,
            reply: buildAcknowledgementReply(trimmed),
            nextState: state,
            stateData: data,
        };
    }
    if (!isOnboardingState && shouldFallbackToAgent(ctx)) {
        return { handled: false };
    }
    switch (state) {
        case client_1.ConversationState.WELCOME:
            return buildWelcomeState(ctx);
        case client_1.ConversationState.PROFILE_MENU:
            return handleProfileMenu(ctx, normalized);
        case client_1.ConversationState.PROFILE_DNI:
            return handleProfileDni(ctx, trimmed, data);
        case client_1.ConversationState.PROFILE_NAME:
            return handleProfileName(ctx, trimmed, data);
        case client_1.ConversationState.PROFILE_BIRTHDATE:
            return handleProfileBirthDate(ctx, trimmed, data);
        case client_1.ConversationState.PROFILE_ADDRESS:
            return handleProfileAddress(ctx, trimmed, data);
        case client_1.ConversationState.PROFILE_INSURANCE:
            return handleProfileInsurance(ctx, trimmed, data);
        case client_1.ConversationState.PROFILE_REASON:
            return handleProfileReason(ctx, trimmed, data);
        case client_1.ConversationState.BOOKING_MENU:
            return handleBookingMenu(ctx, normalized, data);
        case client_1.ConversationState.BOOKING_CHOOSE_DAY:
            return handleChooseDay(ctx, normalized, data);
        case client_1.ConversationState.BOOKING_CHOOSE_SLOT:
            return handleChooseSlot(ctx, normalized, data);
        case client_1.ConversationState.BOOKING_CONFIRM:
            return handleConfirmation(ctx, normalized, data);
        case client_1.ConversationState.UPLOAD_WAITING:
            return handleUploadState(ctx, normalized);
        default:
            return { handled: false };
    }
}
function buildWelcomeState(ctx) {
    const menu = buildBookingMenuTemplate();
    const reply = `¡Hola! Soy el asistente del consultorio. Contame si querés sacar, reprogramar o cancelar un turno.`;
    return {
        handled: true,
        reply,
        menu,
        nextState: client_1.ConversationState.BOOKING_MENU,
        stateData: null,
    };
}
function handleProfileMenu(ctx, normalized) {
    return {
        handled: true,
        reply: "Estas son las opciones disponibles:",
        menu: buildBookingMenuTemplate(),
        nextState: client_1.ConversationState.BOOKING_MENU,
        stateData: null,
    };
}
function buildProfileMenuTemplate() {
    return {
        title: "Ficha del paciente",
        prompt: "Elegí cómo querés continuar:",
        options: [
            { id: "A", label: "📝 Completar ficha", aliases: ["1"] },
            { id: "B", label: "👋 Más tarde", aliases: ["2"] },
        ],
        hint: "Sin la ficha no puedo listar horarios.",
    };
}
async function handleProfileDni(ctx, raw, data) {
    const normalized = raw.trim().toLowerCase();
    if (isMenuKeyword(normalized)) {
        return restartOnboardingFlow(ctx);
    }
    if (isExplicitMenuSelection(normalized)) {
        return {
            handled: true,
            reply: "Necesito tu DNI para ubicar o crear tu ficha. Por ejemplo: 12345678.",
            nextState: client_1.ConversationState.PROFILE_DNI,
        };
    }
    const parsed = parseDni(raw);
    if (!parsed) {
        return {
            handled: true,
            reply: "No pude reconocer el DNI. Enviame solo los números, por ejemplo 12345678.",
            nextState: client_1.ConversationState.PROFILE_DNI,
        };
    }
    if (ctx.findPatientByDni) {
        const existing = await ctx.findPatientByDni(parsed);
        if (existing && existing.id !== ctx.patient.id) {
            const targetState = existing.needsName
                ? client_1.ConversationState.PROFILE_NAME
                : existing.needsBirthDate
                    ? client_1.ConversationState.PROFILE_BIRTHDATE
                    : existing.needsAddress
                        ? client_1.ConversationState.PROFILE_ADDRESS
                        : existing.needsInsurance
                            ? client_1.ConversationState.PROFILE_INSURANCE
                            : existing.needsConsultReason
                                ? client_1.ConversationState.PROFILE_REASON
                                : client_1.ConversationState.BOOKING_MENU;
            const firstName = extractFirstName(existing.fullName);
            let reply;
            switch (targetState) {
                case client_1.ConversationState.PROFILE_NAME:
                    reply = `¡Hola ${firstName}! Necesito confirmar tu nombre completo (ej: Ana Pérez).`;
                    break;
                case client_1.ConversationState.PROFILE_BIRTHDATE:
                    reply = `¡Hola ${firstName}! ¿Me recordás tu fecha de nacimiento? (DD/MM/AAAA)`;
                    break;
                case client_1.ConversationState.PROFILE_ADDRESS:
                    reply = `¡Hola ${firstName}! Decime tu dirección (calle y número) para actualizar tu ficha.`;
                    break;
                case client_1.ConversationState.PROFILE_INSURANCE:
                    reply = `¡Hola ${firstName}! ¿Seguís con la misma obra social o prepaga? ¿Cuál es?`;
                    break;
                case client_1.ConversationState.PROFILE_REASON:
                    reply = `¡Hola ${firstName}! Contame brevemente el motivo de la consulta.`;
                    break;
                default:
                    reply = `¡Hola ${firstName}! Ya encontré tu ficha. Elegí una opción para continuar.`;
                    break;
            }
            return {
                handled: true,
                reply,
                ...(targetState === client_1.ConversationState.BOOKING_MENU
                    ? { menu: buildBookingMenuTemplate() }
                    : {}),
                nextState: targetState,
                stateData: targetState === client_1.ConversationState.BOOKING_MENU ? null : data,
                patientProfilePatch: {
                    dni: parsed,
                    needsDni: false,
                },
                mergeWithPatientId: existing.id,
            };
        }
    }
    const nextState = ctx.patient.needsName
        ? client_1.ConversationState.PROFILE_NAME
        : ctx.patient.needsBirthDate
            ? client_1.ConversationState.PROFILE_BIRTHDATE
            : ctx.patient.needsAddress
                ? client_1.ConversationState.PROFILE_ADDRESS
                : ctx.patient.needsInsurance
                    ? client_1.ConversationState.PROFILE_INSURANCE
                    : ctx.patient.needsConsultReason
                        ? client_1.ConversationState.PROFILE_REASON
                        : client_1.ConversationState.BOOKING_MENU;
    const patch = {
        dni: parsed,
        needsDni: false,
    };
    const reply = nextState === client_1.ConversationState.PROFILE_NAME
        ? "Perfecto. Ahora necesito tu nombre y apellido completos (ej: Ana Pérez)."
        : "Gracias. Ya casi terminamos con tu ficha.";
    return {
        handled: true,
        reply: nextState === client_1.ConversationState.BOOKING_MENU
            ? `${reply} Elegí una opción para continuar:`
            : reply,
        ...(nextState === client_1.ConversationState.BOOKING_MENU
            ? { menu: buildBookingMenuTemplate() }
            : {}),
        nextState,
        patientProfilePatch: patch,
        stateData: nextState === client_1.ConversationState.BOOKING_MENU ? null : data,
    };
}
function handleProfileName(ctx, raw, data) {
    const normalized = raw.trim().toLowerCase();
    if (isMenuKeyword(normalized)) {
        return restartOnboardingFlow(ctx);
    }
    if (isExplicitMenuSelection(normalized)) {
        return {
            handled: true,
            reply: "Primero necesito tu nombre y apellido completos (ej: Ana Pérez). Después seguimos con el menú.",
            nextState: client_1.ConversationState.PROFILE_NAME,
        };
    }
    const parsed = parseFullName(raw);
    if (!parsed) {
        return {
            handled: true,
            reply: "Necesito tu nombre y apellido completos. Ejemplo: Ana Pérez. ¿Me lo pasás nuevamente?",
            nextState: client_1.ConversationState.PROFILE_NAME,
        };
    }
    const patch = {
        fullName: parsed,
        needsName: false,
    };
    const intent = data === null || data === void 0 ? void 0 : data.intent;
    const nextState = ctx.patient.needsBirthDate
        ? client_1.ConversationState.PROFILE_BIRTHDATE
        : ctx.patient.needsAddress
            ? client_1.ConversationState.PROFILE_ADDRESS
            : ctx.patient.needsInsurance
                ? client_1.ConversationState.PROFILE_INSURANCE
                : ctx.patient.needsConsultReason
                    ? client_1.ConversationState.PROFILE_REASON
                    : client_1.ConversationState.BOOKING_MENU;
    const replyBase = nextState === client_1.ConversationState.BOOKING_MENU
        ? `Gracias ${parsed.split(" ")[0]} 🙌.`
        : nextState === client_1.ConversationState.PROFILE_BIRTHDATE
            ? `Gracias ${parsed.split(" ")[0]} 🙌. ¿Cuál es tu fecha de nacimiento? (ej: 31/12/1990)`
            : nextState === client_1.ConversationState.PROFILE_ADDRESS
                ? `Gracias ${parsed.split(" ")[0]} 🙌. Ahora decime tu dirección (calle y número).`
                : `Gracias ${parsed.split(" ")[0]} 🙌. Ahora decime si tenés obra social y cuál es.`;
    const reply = nextState === client_1.ConversationState.BOOKING_MENU && intent === "book"
        ? `${replyBase} Te muestro las opciones disponibles:`
        : nextState === client_1.ConversationState.BOOKING_MENU
            ? `${replyBase} Si querés sacar un turno, elegí una opción del menú.`
            : replyBase;
    const nextStateData = nextState === client_1.ConversationState.BOOKING_MENU && intent
        ? { ...data, intent }
        : nextState === client_1.ConversationState.BOOKING_MENU
            ? null
            : data;
    return {
        handled: true,
        reply,
        ...(nextState === client_1.ConversationState.BOOKING_MENU
            ? { menu: buildBookingMenuTemplate() }
            : {}),
        nextState,
        stateData: nextState === client_1.ConversationState.BOOKING_MENU ? null : nextStateData,
        patientProfilePatch: patch,
    };
}
function handleProfileBirthDate(ctx, raw, data) {
    const normalized = raw.trim().toLowerCase();
    if (isMenuKeyword(normalized)) {
        return restartOnboardingFlow(ctx);
    }
    if (isExplicitMenuSelection(normalized)) {
        return {
            handled: true,
            reply: "Para continuar necesito tu fecha de nacimiento. Ejemplo: 31/12/1990.",
            nextState: client_1.ConversationState.PROFILE_BIRTHDATE,
        };
    }
    const parsed = parseBirthDate(raw);
    if (!parsed) {
        return {
            handled: true,
            reply: "No pude interpretar la fecha. Escribila como DD/MM/AAAA (ej: 15/08/1987).",
            nextState: client_1.ConversationState.PROFILE_BIRTHDATE,
        };
    }
    const patch = {
        birthDate: parsed,
        needsBirthDate: false,
    };
    const nextState = ctx.patient.needsAddress
        ? client_1.ConversationState.PROFILE_ADDRESS
        : ctx.patient.needsInsurance
            ? client_1.ConversationState.PROFILE_INSURANCE
            : ctx.patient.needsConsultReason
                ? client_1.ConversationState.PROFILE_REASON
                : client_1.ConversationState.BOOKING_MENU;
    const reply = nextState === client_1.ConversationState.PROFILE_ADDRESS
        ? "Gracias. ¿Me pasás tu dirección (calle y número)?"
        : nextState === client_1.ConversationState.PROFILE_INSURANCE
            ? "Gracias. ¿Tenés obra social o prepaga? Contame cuál."
            : nextState === client_1.ConversationState.PROFILE_REASON
                ? "Listo. Contame brevemente el motivo de tu consulta."
                : "Perfecto. Ya tengo toda tu información.";
    return {
        handled: true,
        reply: nextState === client_1.ConversationState.BOOKING_MENU
            ? `${reply} Elegí una opción para continuar:`
            : reply,
        ...(nextState === client_1.ConversationState.BOOKING_MENU
            ? { menu: buildBookingMenuTemplate() }
            : {}),
        nextState,
        patientProfilePatch: patch,
        stateData: nextState === client_1.ConversationState.BOOKING_MENU ? null : data,
    };
}
function handleProfileAddress(ctx, raw, data) {
    const normalized = raw.trim().toLowerCase();
    if (isMenuKeyword(normalized)) {
        return restartOnboardingFlow(ctx);
    }
    if (isExplicitMenuSelection(normalized)) {
        return {
            handled: true,
            reply: "Necesito tu dirección para completar la ficha (ej: Av. Siempre Viva 742).",
            nextState: client_1.ConversationState.PROFILE_ADDRESS,
        };
    }
    if (raw.trim().length < 5) {
        return {
            handled: true,
            reply: "¿Me pasás una dirección válida? Necesito al menos la calle y el número.",
            nextState: client_1.ConversationState.PROFILE_ADDRESS,
        };
    }
    const patch = {
        address: raw.trim(),
        needsAddress: false,
    };
    const nextState = ctx.patient.needsInsurance
        ? client_1.ConversationState.PROFILE_INSURANCE
        : ctx.patient.needsConsultReason
            ? client_1.ConversationState.PROFILE_REASON
            : client_1.ConversationState.BOOKING_MENU;
    const reply = nextState === client_1.ConversationState.PROFILE_INSURANCE
        ? "Gracias. ¿Tenés obra social o prepaga? ¿Cuál?"
        : nextState === client_1.ConversationState.PROFILE_REASON
            ? "Perfecto. Contame brevemente el motivo de tu consulta."
            : "Listo, ya tengo toda la información necesaria.";
    return {
        handled: true,
        reply: nextState === client_1.ConversationState.BOOKING_MENU
            ? `${reply} Elegí una opción del menú:`
            : reply,
        ...(nextState === client_1.ConversationState.BOOKING_MENU
            ? { menu: buildBookingMenuTemplate() }
            : {}),
        nextState,
        patientProfilePatch: patch,
        stateData: nextState === client_1.ConversationState.BOOKING_MENU ? null : data,
    };
}
function handleProfileInsurance(ctx, raw, data) {
    const normalized = raw.trim().toLowerCase();
    if (isMenuKeyword(normalized)) {
        return restartOnboardingFlow(ctx);
    }
    if (isExplicitMenuSelection(normalized)) {
        return {
            handled: true,
            reply: "Necesito que me digas exactamente cuál es tu obra social o si sos particular. Escribilo tal como aparece en tu credencial.",
            nextState: client_1.ConversationState.PROFILE_INSURANCE,
        };
    }
    const cleaned = (0, text_1.normalizeInsuranceAnswer)(raw);
    if (!cleaned || cleaned.length < 2) {
        return {
            handled: true,
            reply: "¿Tenés obra social? Decime el nombre exacto (por ejemplo: OSDE, Swiss Medical, Particular).",
            nextState: client_1.ConversationState.PROFILE_INSURANCE,
        };
    }
    const patch = {
        insuranceProvider: cleaned,
        needsInsurance: false,
    };
    const intent = data === null || data === void 0 ? void 0 : data.intent;
    const nextState = ctx.patient.needsConsultReason
        ? client_1.ConversationState.PROFILE_REASON
        : client_1.ConversationState.BOOKING_MENU;
    const replyBase = nextState === client_1.ConversationState.BOOKING_MENU
        ? "Perfecto. Ya tengo tu obra social anotada."
        : "Perfecto. Contame el motivo principal de la consulta.";
    const reply = nextState === client_1.ConversationState.BOOKING_MENU && intent === "book"
        ? `${replyBase} Ahora elegimos tu turno. Estas son las opciones:`
        : nextState === client_1.ConversationState.BOOKING_MENU
            ? `${replyBase} Si querés sacar un turno, elegí una opción del menú.`
            : replyBase;
    return {
        handled: true,
        reply,
        ...(nextState === client_1.ConversationState.BOOKING_MENU
            ? { menu: buildBookingMenuTemplate() }
            : {}),
        nextState,
        stateData: nextState === client_1.ConversationState.BOOKING_MENU ? null : data,
        patientProfilePatch: patch,
    };
}
function handleProfileReason(ctx, raw, data) {
    const trimmed = raw.trim();
    const normalized = trimmed.toLowerCase();
    if (isMenuKeyword(normalized)) {
        return restartOnboardingFlow(ctx);
    }
    if (isExplicitMenuSelection(normalized)) {
        const needReasonMessage = data.pendingReasonSlot
            ? 'Antes de continuar necesito el motivo de esta consulta (ej: "control anual"). Si querés volver al menú escribí "volver".'
            : "Antes de seguir necesito el motivo de la consulta (ej: control anual, dolor lumbar).";
        return {
            handled: true,
            reply: needReasonMessage,
            nextState: client_1.ConversationState.PROFILE_REASON,
        };
    }
    const fromOnboarding = ctx.patient.needsConsultReason && !data.pendingReasonSlot;
    if (data.pendingReasonSlot && isBackCommand(normalized)) {
        const hasSlots = !!(data.pendingSlots && data.pendingSlots.length);
        return {
            handled: true,
            reply: hasSlots
                ? "Volvemos a los horarios disponibles. Elegí otro horario:"
                : "Volvemos al menú principal para que elijas otra opción.",
            menu: hasSlots
                ? buildSlotMenuTemplate(data.pendingSlots)
                : buildBookingMenuTemplate(),
            nextState: hasSlots
                ? client_1.ConversationState.BOOKING_CHOOSE_SLOT
                : client_1.ConversationState.BOOKING_MENU,
            stateData: hasSlots
                ? {
                    ...data,
                    pendingReasonSlot: undefined,
                }
                : null,
            patientProfilePatch: {
                needsConsultReason: false,
            },
        };
    }
    const formatted = (0, text_1.formatConsultReasonAnswer)(trimmed) || trimmed.slice(0, 160);
    if (!formatted) {
        const needReasonMessage = data.pendingReasonSlot
            ? 'Necesito el motivo de esta consulta para confirmar el turno. Contalo en pocas palabras (por ejemplo: "control anual", "dolor lumbar"). Si querés cambiar el horario escribí "volver".'
            : "Contame en pocas palabras el motivo de la consulta (ej: control anual, dolor de cabeza).";
        return {
            handled: true,
            reply: needReasonMessage,
            nextState: client_1.ConversationState.PROFILE_REASON,
        };
    }
    const patch = {
        consultReason: formatted,
        needsConsultReason: false,
    };
    if (data.pendingReasonSlot) {
        const slotLabel = data.pendingReasonSlot.slotLabel;
        const bookingRequest = {
            type: "book",
            slotISO: data.pendingReasonSlot.slotISO,
            slotLabel,
        };
        return {
            handled: true,
            reply: `Perfecto, confirmo el turno ${slotLabel}.`,
            nextState: client_1.ConversationState.BOOKING_MENU,
            stateData: null,
            patientProfilePatch: patch,
            bookingRequest,
        };
    }
    return {
        handled: true,
        reply: "Gracias, ya anoté el motivo. Te muestro las opciones disponibles:",
        menu: buildBookingMenuTemplate(),
        nextState: client_1.ConversationState.BOOKING_MENU,
        stateData: fromOnboarding ? { onboardingReasonSatisfied: true } : null,
        patientProfilePatch: patch,
    };
}
function handleBookingMenu(ctx, normalized, data) {
    const persistentMenuState = data.onboardingReasonSatisfied
        ? { onboardingReasonSatisfied: true }
        : null;
    if (isBackCommand(normalized)) {
        return {
            handled: true,
            reply: "Estas son las opciones disponibles:",
            menu: buildBookingMenuTemplate(),
            nextState: client_1.ConversationState.BOOKING_MENU,
            stateData: persistentMenuState,
        };
    }
    if (matchesSelection(normalized, "A")) {
        const bookingStateData = {
            ...(persistentMenuState !== null && persistentMenuState !== void 0 ? persistentMenuState : {}),
            intent: "book",
        };
        const gateResult = gateProfileDataForBooking(ctx, bookingStateData);
        if (gateResult) {
            return gateResult;
        }
        if (!ctx.availableSlots.length) {
            return {
                handled: true,
                reply: "Por ahora no encuentro turnos disponibles. Avisame si querés que te avise cuando se libere uno.",
                nextState: client_1.ConversationState.BOOKING_MENU,
                stateData: persistentMenuState,
            };
        }
        const dayOptions = buildDayOptions(ctx.availableSlots, ctx.timezone);
        return {
            handled: true,
            reply: "Elegí el día que te resulte cómodo:",
            menu: buildDayMenuTemplate(dayOptions),
            nextState: client_1.ConversationState.BOOKING_CHOOSE_DAY,
            stateData: {
                intent: "book",
                pendingDays: dayOptions,
                requireFreshReason: data.onboardingReasonSatisfied ? false : true,
            },
        };
    }
    if (matchesSelection(normalized, "B")) {
        if (!ctx.activeAppointment) {
            return {
                handled: true,
                reply: "No encuentro turnos confirmados para reprogramar. Si querés sacar uno nuevo, elegí “📅 Sacar nuevo turno”.",
                menu: buildBookingMenuTemplate(),
                nextState: client_1.ConversationState.BOOKING_MENU,
                stateData: persistentMenuState,
            };
        }
        if (!ctx.availableSlots.length) {
            return {
                handled: true,
                reply: "Por ahora no hay horarios alternativos. En cuanto se libere algo te aviso.",
                nextState: client_1.ConversationState.BOOKING_MENU,
                stateData: persistentMenuState,
            };
        }
        const dayOptions = buildDayOptions(ctx.availableSlots, ctx.timezone);
        return {
            handled: true,
            reply: `Tu turno actual es ${ctx.activeAppointment.humanLabel}. Elegí el nuevo día que te sirva:`,
            menu: buildDayMenuTemplate(dayOptions),
            nextState: client_1.ConversationState.BOOKING_CHOOSE_DAY,
            stateData: {
                intent: "reschedule",
                rescheduleAppointmentId: ctx.activeAppointment.id,
                pendingDays: dayOptions,
            },
        };
    }
    if (matchesSelection(normalized, "C")) {
        if (!ctx.activeAppointment) {
            return {
                handled: true,
                reply: "No tenés turnos para cancelar. ¿Querés sacar uno nuevo?",
                menu: buildBookingMenuTemplate(),
                nextState: client_1.ConversationState.BOOKING_MENU,
                stateData: persistentMenuState,
            };
        }
        return {
            handled: true,
            reply: `Tu turno actual es ${ctx.activeAppointment.humanLabel}. ¿Confirmás que querés cancelarlo? Respondé "Sí" para confirmar o "No" para volver al menú.`,
            nextState: client_1.ConversationState.BOOKING_CONFIRM,
            stateData: {
                intent: "cancel",
                rescheduleAppointmentId: ctx.activeAppointment.id,
            },
        };
    }
    if (matchesSelection(normalized, "D")) {
        if (ctx.patient.needsDni ||
            ctx.patient.needsName ||
            ctx.patient.needsBirthDate ||
            ctx.patient.needsAddress ||
            ctx.patient.needsInsurance ||
            ctx.patient.needsConsultReason) {
            return {
                handled: true,
                reply: "Para subir documentos primero necesito tus datos básicos. Elegí “📅 Sacar nuevo turno”, completá la ficha y después volvés a intentar.",
                menu: buildBookingMenuTemplate(),
                nextState: client_1.ConversationState.BOOKING_MENU,
                stateData: persistentMenuState,
            };
        }
        return {
            handled: true,
            reply: "Perfecto. Enviame tus archivos o imágenes (estudios, recetas, documentos) como foto o PDF. Podés mandar varios seguidos. Cuando termines, escribí “menu” para volver.",
            nextState: client_1.ConversationState.UPLOAD_WAITING,
            stateData: null,
        };
    }
    return {
        handled: true,
        reply: "No entendí la opción. Respondé con la letra indicada (A, B, C o D):",
        menu: buildBookingMenuTemplate(),
        nextState: client_1.ConversationState.BOOKING_MENU,
        stateData: persistentMenuState,
    };
}
function handleChooseDay(ctx, normalized, data) {
    if (!data.pendingDays || !data.pendingDays.length) {
        return {
            handled: true,
            reply: "Reinicio el menú para que puedas elegir otra vez.",
            menu: buildBookingMenuTemplate(),
            nextState: client_1.ConversationState.BOOKING_MENU,
            stateData: null,
        };
    }
    if (isBackCommand(normalized)) {
        return {
            handled: true,
            reply: "Volvemos al menú principal.",
            menu: buildBookingMenuTemplate(),
            nextState: client_1.ConversationState.BOOKING_MENU,
            stateData: null,
        };
    }
    const quickIntent = detectQuickIntent(normalized);
    if (quickIntent) {
        return resolveQuickIntent(quickIntent, ctx);
    }
    const matchedDay = matchOptionFromState(normalized, data.pendingDays);
    if (!matchedDay) {
        return {
            handled: true,
            reply: "No identifiqué esa opción. Elegí uno de los días listados:",
            menu: buildDayMenuTemplate(data.pendingDays),
            nextState: client_1.ConversationState.BOOKING_CHOOSE_DAY,
            stateData: data,
        };
    }
    const slotsForDay = buildSlotOptionsForDay(ctx.availableSlots, matchedDay.dateISO);
    if (!slotsForDay.length) {
        return {
            handled: true,
            reply: "Ese día ya no tiene horarios disponibles. Elegí otro día del listado.",
            menu: buildDayMenuTemplate(data.pendingDays),
            nextState: client_1.ConversationState.BOOKING_CHOOSE_DAY,
            stateData: data,
        };
    }
    return {
        handled: true,
        reply: `Estos son los horarios para ${matchedDay.label}:`,
        menu: buildSlotMenuTemplate(slotsForDay),
        nextState: client_1.ConversationState.BOOKING_CHOOSE_SLOT,
        stateData: {
            ...data,
            selectedDayISO: matchedDay.dateISO,
            pendingSlots: slotsForDay,
        },
    };
}
function handleChooseSlot(ctx, normalized, data) {
    var _a, _b;
    if (!data.pendingSlots || !data.pendingSlots.length) {
        return {
            handled: true,
            reply: "Vuelvo al menú para que elijas nuevamente.",
            menu: buildBookingMenuTemplate(),
            nextState: client_1.ConversationState.BOOKING_MENU,
            stateData: null,
        };
    }
    if (isBackCommand(normalized)) {
        return {
            handled: true,
            reply: "Seleccioná otro día:",
            menu: buildDayMenuTemplate(data.pendingDays || []),
            nextState: client_1.ConversationState.BOOKING_CHOOSE_DAY,
            stateData: {
                ...data,
                pendingSlots: undefined,
            },
        };
    }
    const quickIntent = detectQuickIntent(normalized);
    if (quickIntent) {
        return resolveQuickIntent(quickIntent, ctx);
    }
    const matchedSlot = matchOptionFromState(normalized, data.pendingSlots);
    if (!matchedSlot) {
        return {
            handled: true,
            reply: "No identifiqué ese horario. Elegí uno del listado:",
            menu: buildSlotMenuTemplate(data.pendingSlots),
            nextState: client_1.ConversationState.BOOKING_CHOOSE_SLOT,
            stateData: data,
        };
    }
    const intent = data.intent || "book";
    if (intent === "book") {
        const needsFreshReason = data.requireFreshReason !== false;
        if (!needsFreshReason && ((_a = ctx.patient.consultReason) === null || _a === void 0 ? void 0 : _a.trim())) {
            const bookingRequest = {
                type: "book",
                slotISO: matchedSlot.startISO,
                slotLabel: matchedSlot.label,
            };
            return {
                handled: true,
                reply: `Perfecto, confirmo el turno ${matchedSlot.label}.`,
                nextState: client_1.ConversationState.BOOKING_MENU,
                stateData: null,
                bookingRequest,
            };
        }
        return {
            handled: true,
            reply: "Antes de confirmar el turno necesito que me cuentes el motivo de esta consulta. Escribilo en pocas palabras.",
            nextState: client_1.ConversationState.PROFILE_REASON,
            stateData: {
                ...data,
                pendingReasonSlot: {
                    slotISO: matchedSlot.startISO,
                    slotLabel: matchedSlot.label,
                },
                requireFreshReason: true,
            },
        };
    }
    const bookingRequest = {
        type: "reschedule",
        slotISO: matchedSlot.startISO,
        slotLabel: matchedSlot.label,
        appointmentId: (_b = data.rescheduleAppointmentId) !== null && _b !== void 0 ? _b : null,
    };
    return {
        handled: true,
        reply: `Perfecto, preparo el cambio al turno ${matchedSlot.label}.`,
        nextState: client_1.ConversationState.BOOKING_MENU,
        stateData: null,
        bookingRequest,
    };
}
function handleConfirmation(ctx, normalized, data) {
    if (!data.intent || data.intent !== "cancel" || !data.rescheduleAppointmentId) {
        return {
            handled: true,
            reply: "Retomo el menú principal.",
            menu: buildBookingMenuTemplate(),
            nextState: client_1.ConversationState.BOOKING_MENU,
            stateData: null,
        };
    }
    if (isPositive(normalized)) {
        const cancelRequest = {
            appointmentId: data.rescheduleAppointmentId,
        };
        return {
            handled: true,
            reply: "Perfecto, confirmo la cancelación.",
            nextState: client_1.ConversationState.BOOKING_MENU,
            stateData: null,
            cancelRequest,
        };
    }
    if (isNegative(normalized) || isBackCommand(normalized)) {
        return {
            handled: true,
            reply: "No cancelé nada. Estas son las opciones disponibles:",
            menu: buildBookingMenuTemplate(),
            nextState: client_1.ConversationState.BOOKING_MENU,
            stateData: null,
        };
    }
    return {
        handled: true,
        reply: "¿Confirmás la cancelación? Respondé Sí o No.",
        nextState: client_1.ConversationState.BOOKING_CONFIRM,
        stateData: data,
    };
}
function handleUploadState(ctx, normalized) {
    if (isMenuKeyword(normalized) || isBackCommand(normalized)) {
        return {
            handled: true,
            reply: "Estas son las opciones disponibles:",
            menu: buildBookingMenuTemplate(),
            nextState: client_1.ConversationState.BOOKING_MENU,
            stateData: null,
        };
    }
    return {
        handled: true,
        reply: "Enviame tus archivos o imágenes (fotos, PDFs, documentos). Podés mandar varios seguidos. Cuando termines, escribí “menu” para volver.",
        nextState: client_1.ConversationState.UPLOAD_WAITING,
        stateData: null,
    };
}
function resolveState(patient, data) {
    if (patient.conversationState === client_1.ConversationState.WELCOME) {
        return client_1.ConversationState.WELCOME;
    }
    if (patient.needsDni) {
        return client_1.ConversationState.PROFILE_DNI;
    }
    if (patient.needsName) {
        return client_1.ConversationState.PROFILE_NAME;
    }
    if (patient.needsBirthDate) {
        return client_1.ConversationState.PROFILE_BIRTHDATE;
    }
    if (patient.needsAddress) {
        return client_1.ConversationState.PROFILE_ADDRESS;
    }
    if (patient.needsInsurance) {
        return client_1.ConversationState.PROFILE_INSURANCE;
    }
    if (patient.needsConsultReason) {
        return client_1.ConversationState.PROFILE_REASON;
    }
    if (patient.conversationState === client_1.ConversationState.BOOKING_CHOOSE_SLOT &&
        (!data.pendingSlots || !data.pendingSlots.length)) {
        return client_1.ConversationState.BOOKING_MENU;
    }
    return patient.conversationState;
}
function detectQuickIntent(normalized) {
    if (!normalized)
        return null;
    if (/(menu|opciones|principal)/.test(normalized)) {
        return "menu";
    }
    if (/(cancel|baja|anular)/.test(normalized)) {
        return "cancel";
    }
    if (/(reprogram|cambiar)/.test(normalized)) {
        return "reschedule";
    }
    if (/(sacar|turno nuevo|agendar)/.test(normalized)) {
        return "book";
    }
    return null;
}
function resolveQuickIntent(intent, ctx) {
    if (intent === "menu") {
        return {
            handled: true,
            reply: "Estas son las opciones disponibles:",
            menu: buildBookingMenuTemplate(),
            nextState: client_1.ConversationState.BOOKING_MENU,
            stateData: null,
        };
    }
    if (intent === "cancel") {
        if (!ctx.activeAppointment) {
            return {
                handled: true,
                reply: "No tenés turnos confirmados para cancelar. ¿Querés sacar uno nuevo?",
                menu: buildBookingMenuTemplate(),
                nextState: client_1.ConversationState.BOOKING_MENU,
                stateData: null,
            };
        }
        return {
            handled: true,
            reply: `Tu turno actual es ${ctx.activeAppointment.humanLabel}. ¿Confirmás que querés cancelarlo? Respondé "Sí" para confirmar o "No" para volver al menú.`,
            nextState: client_1.ConversationState.BOOKING_CONFIRM,
            stateData: {
                intent: "cancel",
                rescheduleAppointmentId: ctx.activeAppointment.id,
            },
        };
    }
    if (intent === "reschedule") {
        if (!ctx.activeAppointment) {
            return {
                handled: true,
                reply: "No encuentro turnos confirmados para reprogramar. Si querés sacar uno nuevo, elegí la opción A del menú.",
                menu: buildBookingMenuTemplate(),
                nextState: client_1.ConversationState.BOOKING_MENU,
                stateData: null,
            };
        }
        if (!ctx.availableSlots.length) {
            return {
                handled: true,
                reply: "Por ahora no hay horarios alternativos. Apenas se libere alguno te aviso.",
                nextState: client_1.ConversationState.BOOKING_MENU,
                stateData: null,
            };
        }
        const dayOptions = buildDayOptions(ctx.availableSlots, ctx.timezone);
        return {
            handled: true,
            reply: `Tu turno actual es ${ctx.activeAppointment.humanLabel}. Elegí el nuevo día que te sirva:`,
            menu: buildDayMenuTemplate(dayOptions),
            nextState: client_1.ConversationState.BOOKING_CHOOSE_DAY,
            stateData: {
                intent: "reschedule",
                rescheduleAppointmentId: ctx.activeAppointment.id,
                pendingDays: dayOptions,
            },
        };
    }
    // intent === "book"
    if (!ctx.availableSlots.length) {
        return {
            handled: true,
            reply: "Por ahora no encuentro turnos disponibles. Avisame si querés que te avise cuando se libere uno.",
            nextState: client_1.ConversationState.BOOKING_MENU,
            stateData: null,
        };
    }
    const dayOptions = buildDayOptions(ctx.availableSlots, ctx.timezone);
    return {
        handled: true,
        reply: "Elegí el día que te resulte cómodo:",
        menu: buildDayMenuTemplate(dayOptions),
        nextState: client_1.ConversationState.BOOKING_CHOOSE_DAY,
        stateData: {
            intent: "book",
            pendingDays: dayOptions,
        },
    };
}
function parseStateData(value) {
    if (!value || typeof value !== "object") {
        return {};
    }
    const clone = value;
    const safeArray = (maybe) => {
        if (!Array.isArray(maybe))
            return [];
        return maybe.filter((entry) => entry &&
            typeof entry === "object" &&
            typeof entry.id === "string");
    };
    return {
        intent: typeof clone.intent === "string" ? clone.intent : undefined,
        pendingDays: safeArray(clone.pendingDays),
        pendingSlots: safeArray(clone.pendingSlots),
        selectedDayISO: typeof clone.selectedDayISO === "string" ? clone.selectedDayISO : undefined,
        rescheduleAppointmentId: typeof clone.rescheduleAppointmentId === "number"
            ? clone.rescheduleAppointmentId
            : undefined,
        pendingReasonSlot: clone.pendingReasonSlot &&
            typeof clone.pendingReasonSlot === "object" &&
            typeof clone.pendingReasonSlot.slotISO === "string" &&
            typeof clone.pendingReasonSlot.slotLabel === "string"
            ? {
                slotISO: clone.pendingReasonSlot.slotISO,
                slotLabel: clone.pendingReasonSlot.slotLabel,
                appointmentId: typeof clone.pendingReasonSlot.appointmentId === "number"
                    ? clone.pendingReasonSlot.appointmentId
                    : undefined,
            }
            : undefined,
        requireFreshReason: typeof clone.requireFreshReason === "boolean"
            ? clone.requireFreshReason
            : undefined,
        onboardingReasonSatisfied: typeof clone.onboardingReasonSatisfied === "boolean"
            ? clone.onboardingReasonSatisfied
            : undefined,
    };
}
function matchesSelection(normalized, id, keywords = []) {
    if (!normalized)
        return false;
    const cleaned = normalized.replace(/[\s.]/g, "").toLowerCase();
    const idLower = id.toLowerCase();
    if (cleaned === idLower)
        return true;
    if (keywords.some((keyword) => cleaned.includes(keyword.replace(/[\s.]/g, "").toLowerCase()))) {
        return true;
    }
    return false;
}
function matchOptionFromState(normalized, options) {
    const cleaned = normalized.replace(/[\s.]/g, "").toLowerCase();
    return (options.find((option) => {
        var _a;
        const idLower = option.id.toLowerCase();
        if (cleaned === idLower)
            return true;
        if ((_a = option.aliases) === null || _a === void 0 ? void 0 : _a.some((alias) => cleaned === alias.replace(/[\s.]/g, "").toLowerCase())) {
            return true;
        }
        return false;
    }) || null);
}
function parseFullName(raw) {
    const normalized = raw.replace(/\s+/g, " ").trim();
    if (!normalized)
        return null;
    if (normalized.split(" ").length < 2) {
        return null;
    }
    if (!/^[a-záéíóúñü\s.'-]+$/i.test(normalized)) {
        return null;
    }
    return normalized
        .split(" ")
        .filter(Boolean)
        .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
}
function buildBookingMenuTemplate() {
    return {
        title: "¿Qué necesitás?",
        prompt: "Elegí una opción para seguir:",
        options: [
            { id: "A", label: "📅 Sacar nuevo turno" },
            { id: "B", label: "♻️ Reprogramar turno" },
            { id: "C", label: "❌ Cancelar turno" },
            { id: "D", label: "🗂 Subir estudios / documentos / recetas" },
        ],
        hint: "Respondé con A, B, C o D.",
    };
}
function buildDayOptions(slots, timezone) {
    const grouped = new Map();
    slots.forEach((slot) => {
        const date = new Date(slot.startISO);
        if (isNaN(date.getTime()))
            return;
        const key = formatDateKey(date, timezone);
        if (!key)
            return;
        const label = formatDayLabel(date, timezone);
        const entry = grouped.get(key);
        if (entry) {
            entry.count += 1;
        }
        else {
            grouped.set(key, { label, count: 1 });
        }
    });
    const options = [];
    let index = 1;
    for (const [dateISO, meta] of grouped.entries()) {
        const id = optionLetterFromIndex(index);
        options.push({
            id,
            dateISO,
            label: `${meta.label} (${meta.count} turnos)`,
            aliases: [String(index)],
        });
        index += 1;
    }
    return options;
}
function buildDayMenuTemplate(options) {
    return {
        title: "Elegí un día",
        prompt: "Respondé con la letra del día que prefieras:",
        options,
        hint: "Podés escribir \"volver\" para regresar al menú.",
    };
}
function buildSlotOptionsForDay(slots, dayISO) {
    const list = [];
    let index = 1;
    for (const slot of slots) {
        if (!slot.startISO.startsWith(dayISO))
            continue;
        const id = optionLetterFromIndex(index);
        list.push({
            id,
            startISO: slot.startISO,
            label: slot.humanLabel,
            aliases: [String(index)],
        });
        index += 1;
    }
    return list;
}
function gateProfileDataForBooking(ctx, stateData) {
    const dataToPersist = {
        ...stateData,
        intent: "book",
    };
    if (ctx.patient.needsDni) {
        return {
            handled: true,
            reply: "Antes de continuar necesito tu DNI (solo números).",
            nextState: client_1.ConversationState.PROFILE_DNI,
            stateData: dataToPersist,
        };
    }
    if (ctx.patient.needsName) {
        return {
            handled: true,
            reply: "Para avanzar con el turno necesito tu nombre completo (ej: Ana Pérez).",
            nextState: client_1.ConversationState.PROFILE_NAME,
            stateData: dataToPersist,
        };
    }
    if (ctx.patient.needsBirthDate) {
        return {
            handled: true,
            reply: "También necesito tu fecha de nacimiento (ej: 31/12/1990).",
            nextState: client_1.ConversationState.PROFILE_BIRTHDATE,
            stateData: dataToPersist,
        };
    }
    if (ctx.patient.needsAddress) {
        return {
            handled: true,
            reply: "Antes de ofrecer turnos necesito tu dirección (calle y número).",
            nextState: client_1.ConversationState.PROFILE_ADDRESS,
            stateData: dataToPersist,
        };
    }
    if (ctx.businessType === "HEALTH" && ctx.patient.needsInsurance) {
        return {
            handled: true,
            reply: "¿Tenés obra social o prepaga? Decime el nombre exacto para registrarlo.",
            nextState: client_1.ConversationState.PROFILE_INSURANCE,
            stateData: dataToPersist,
        };
    }
    return null;
}
function buildSlotMenuTemplate(options) {
    return {
        title: "Horarios disponibles",
        prompt: "Respondé con la letra del horario que prefieras:",
        options,
        hint: "Si querés volver atrás, escribí \"volver\".",
    };
}
function restartOnboardingFlow(ctx) {
    if (!ctx.patient.needsDni &&
        !ctx.patient.needsName &&
        !ctx.patient.needsBirthDate &&
        !ctx.patient.needsAddress &&
        !ctx.patient.needsInsurance &&
        !ctx.patient.needsConsultReason) {
        return {
            handled: true,
            reply: "Estas son las opciones disponibles:",
            menu: buildBookingMenuTemplate(),
            nextState: client_1.ConversationState.BOOKING_MENU,
            stateData: null,
        };
    }
    const patch = {
        needsName: true,
        needsBirthDate: true,
        needsAddress: true,
        needsInsurance: ctx.businessType === "HEALTH" ? true : ctx.patient.needsInsurance,
        needsConsultReason: ctx.businessType === "HEALTH" ? true : ctx.patient.needsConsultReason,
        birthDate: null,
        address: null,
    };
    if (ctx.businessType === "HEALTH" || ctx.patient.needsInsurance) {
        patch.insuranceProvider = null;
    }
    if (ctx.businessType === "HEALTH" || ctx.patient.needsConsultReason) {
        patch.consultReason = null;
    }
    if (!ctx.patient.needsName && ctx.patient.fullName) {
        patch.fullName = "Paciente WhatsApp";
    }
    return {
        handled: true,
        reply: "Listo, volvemos al menú y reiniciamos el registro. Cuando quieras, arrancamos de nuevo.",
        menu: buildBookingMenuTemplate(),
        nextState: client_1.ConversationState.BOOKING_MENU,
        stateData: null,
        patientProfilePatch: patch,
    };
}
function extractFirstName(value) {
    if (!value)
        return "paciente";
    const trimmed = value.trim();
    if (!trimmed)
        return "paciente";
    return trimmed.split(/\s+/)[0];
}
function parseDni(raw) {
    if (!raw)
        return null;
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 10) {
        return null;
    }
    return digits;
}
function parseBirthDate(raw) {
    if (!raw)
        return null;
    const match = raw
        .trim()
        .match(/(\d{1,2})[\/\-\.\s]+(\d{1,2})[\/\-\.\s]+(\d{2,4})/);
    if (!match)
        return null;
    let day = Number(match[1]);
    let month = Number(match[2]);
    let year = Number(match[3]);
    if (Number.isNaN(day) ||
        Number.isNaN(month) ||
        Number.isNaN(year) ||
        day < 1 ||
        day > 31 ||
        month < 1 ||
        month > 12) {
        return null;
    }
    if (year < 100) {
        year += year >= 40 ? 1900 : 2000;
    }
    if (year < 1900)
        return null;
    const result = new Date(Date.UTC(year, month - 1, day));
    if (result.getUTCFullYear() !== year ||
        result.getUTCMonth() !== month - 1 ||
        result.getUTCDate() !== day) {
        return null;
    }
    const today = new Date();
    if (result > today)
        return null;
    return result.toISOString();
}
function shouldFallbackToAgent(ctx) {
    if (!ctx.incomingText)
        return false;
    if (ctx.patient.conversationState === client_1.ConversationState.UPLOAD_WAITING) {
        return false;
    }
    const normalized = ctx.incomingText.trim().toLowerCase();
    if (!normalized)
        return false;
    if (normalized === "menu" || normalized === "menú")
        return false;
    if (normalized.length <= 2)
        return false;
    if (/^[a-z]\.?$/.test(normalized))
        return false;
    if (/^(opcion|opción)\s+[a-z]/.test(normalized))
        return false;
    return isGeneralQuestion(normalized);
}
function isGeneralQuestion(normalized) {
    if (normalized.includes("?"))
        return true;
    const keywordPatterns = [
        "precio",
        "valor",
        "cuanto",
        "cuánto",
        "cuesta",
        "arancel",
        "honorario",
        "costo",
        "tarifa",
        "horario",
        "atiende",
        "trabaja",
        "dias",
        "días",
        "sabado",
        "sábado",
        "domingo",
        "direccion",
        "dirección",
        "donde",
        "dónde",
        "ubicacion",
        "ubicación",
        "telefono",
        "teléfono",
        "pago",
        "pagar",
        "transferencia",
        "efectivo",
        "consultorio",
        "duracion",
        "duración",
        "obra social",
        "prepaga",
        "particular",
    ];
    if (keywordPatterns.some((kw) => normalized.includes(kw))) {
        return true;
    }
    if (/^(quiero saber|me pod[eé]s|me podes|pod[eé]s decirme|podes decirme|podr[ií]as decirme|informaci[oó]n|info)/.test(normalized)) {
        return true;
    }
    return false;
}
function optionLetterFromIndex(index) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let n = index - 1;
    let result = "";
    do {
        result = alphabet[n % 26] + result;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return result;
}
function formatDateKey(date, timezone) {
    try {
        const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
        return formatter.format(date);
    }
    catch {
        return null;
    }
}
function formatDayLabel(date, timezone) {
    try {
        const formatter = new Intl.DateTimeFormat("es-AR", {
            timeZone: timezone,
            weekday: "long",
            day: "2-digit",
            month: "2-digit",
        });
        const formatted = formatter.format(date);
        return capitalize(formatted);
    }
    catch {
        return date.toDateString();
    }
}
function capitalize(value) {
    if (!value)
        return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
}
function isBackCommand(normalized) {
    return ["volver", "atrás", "atras", "menu", "menú"].some((word) => normalized.includes(word));
}
function isMenuKeyword(normalized) {
    return /\bmen[úu]\b/.test(normalized) || normalized === "menu";
}
const MENU_SELECTION_PATTERNS = [
    /^[abcd]\.?$/,
    /^opci[oó]n\s+[abcd]$/,
    /^letra\s+[abcd]$/,
    /^sacar(\s+un)?\s+turno/,
    /^quiero(\s+un)?\s+turno/,
    /^agendar(\s+un)?\s+turno/,
    /^reprogram/,
    /^cambiar(\s+de)?\s+turno/,
    /^cancel/,
    /^baja\b/,
    /^subir\s+(documentos|estudios|recetas?)/,
    /^documentos?$/,
    /^estudios?$/,
    /^recetas?$/,
];
function isExplicitMenuSelection(normalized) {
    if (!normalized)
        return false;
    const cleaned = normalized.replace(/\s+/g, "");
    if (["a", "b", "c", "d"].includes(cleaned)) {
        return true;
    }
    return MENU_SELECTION_PATTERNS.some((pattern) => pattern.test(normalized));
}
function isPositive(normalized) {
    return /(si|sí|dale|ok|confirmo|perfecto)/i.test(normalized);
}
function isNegative(normalized) {
    return /(no|prefiero que no|cancelá|cancelar)/i.test(normalized);
}
function isGenericAcknowledgement(text) {
    return /^(gracias|ok|dale|perfecto|genial|listo|bien|👍|🙏)/i.test(text.trim());
}
function buildAcknowledgementReply(text) {
    const lower = text.trim().toLowerCase();
    if (/(gracias|🙏)/.test(lower)) {
        return "De nada 🙌. Si necesitás algo más, escribime por acá.";
    }
    if (/(dale|ok|listo|perfecto|genial|bien|👍)/.test(lower)) {
        return "Listo, quedo atento 👌.";
    }
    return "Perfecto, quedo atento.";
}
