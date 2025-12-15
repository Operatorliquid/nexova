import { Prisma, Patient, BusinessType } from "@prisma/client";
import { runWhatsappAgent, AvailableSlot } from "../ai";
import {
  normalizeInsuranceAnswer,
  normalizeDniInput,
} from "../utils/text";
import { prisma } from "../prisma";
import { handleConversationFlow } from "../conversation/stateMachine";
import {
  BookingRequest,
  CancelRequest,
  MenuTemplate,
} from "../conversation/types";
import { appendMenuHintForBusiness } from "../utils/hints";
import { sendWhatsAppText } from "../whatsapp";

export type HealthConversationResult = {
  replyToPatient: string;
  action: any;
  pendingSlotHint?: { startISO: string; humanLabel: string; reason?: string | null };
  patient: Patient;
};

type ActiveAppointmentSummary = {
  id: number;
  dateTime: Date;
  humanLabel: string;
  status: string;
} | null;

export async function handleHealthConversation(opts: {
  text: string;
  patient: Patient;
  doctor: any;
  recentMessages: any[];
  productCatalog: string[];
  availableSlots: AvailableSlot[];
  timezone: string;
}) {
  const {
    text,
    patient,
    doctor,
    recentMessages,
    productCatalog,
    availableSlots,
    timezone,
  } = opts;

  const parsePrice = (value?: string | null): number | null => {
    if (!value) return null;
    const cleaned = value.replace(/[^\d.,]/g, "").replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  const consultationPrice = parsePrice(doctor.consultFee ?? null);
  const emergencyConsultationPrice = parsePrice(doctor.emergencyFee ?? null);

  const patientProfilePayload = {
    consultReason: patient.consultReason ?? null,
    pendingSlotISO: patient.pendingSlotISO ? patient.pendingSlotISO.toISOString() : null,
    pendingSlotHumanLabel: patient.pendingSlotHumanLabel ?? null,
    pendingSlotExpiresAt: patient.pendingSlotExpiresAt ? patient.pendingSlotExpiresAt.toISOString() : null,
    pendingSlotReason: patient.pendingSlotReason ?? null,
    dni: patient.dni ?? null,
    birthDate: patient.birthDate ? patient.birthDate.toISOString() : null,
    address: patient.address ?? null,
    needsDni: patient.needsDni,
    needsName: patient.needsName,
    needsBirthDate: patient.needsBirthDate,
    needsAddress: patient.needsAddress,
    needsInsurance: patient.needsInsurance,
    needsConsultReason: patient.needsConsultReason,
    preferredDayISO: patient.preferredDayISO ? patient.preferredDayISO.toISOString() : null,
    preferredDayLabel: patient.preferredDayISO
      ? formatPreferredDayLabel(patient.preferredDayISO, timezone)
      : null,
    preferredHourMinutes: typeof patient.preferredHour === "number" ? patient.preferredHour : null,
    preferredDayHasAvailability: patient.preferredDayISO instanceof Date ? null : null,
  };

  const agentResult = await runWhatsappAgent({
    text,
    patientName: patient.fullName,
    patientPhone: patient.phone!,
    doctorName: doctor.name,
    doctorId: doctor.id,
    businessType: doctor.businessType as BusinessType,
    timezone,
    availableSlots,
    recentMessages,
    patientProfile: patientProfilePayload,
    doctorProfile: {
      specialty: doctor.specialty ?? null,
      clinicName: doctor.clinicName ?? null,
      officeAddress: doctor.clinicAddress ?? null,
      officeCity: null,
      officeMapsUrl: null,
      officeDays: doctor.officeDays ?? null,
      officeHours: doctor.officeHours ?? null,
      contactPhone: doctor.contactPhone ?? null,
      consultationPrice,
      emergencyConsultationPrice,
      additionalNotes: doctor.extraNotes ?? null,
      slotMinutes: doctor.appointmentSlotMinutes ?? null,
    },
    productCatalog,
  });

  if (!agentResult) return null;

  let updatedPatient: Patient = patient;

  if (agentResult.profileUpdates) {
    const profileUpdates = agentResult.profileUpdates;
    const updateData: Prisma.PatientUpdateInput = {};

    const normalizedName = normalizeAgentProvidedName(profileUpdates.name);
    if (normalizedName) {
      updateData.fullName = normalizedName;
      updateData.needsName = false;
    }

    if (profileUpdates.insurance && doctor.businessType !== "RETAIL") {
      const normalizedInsurance =
        normalizeInsuranceAnswer(profileUpdates.insurance) ||
        profileUpdates.insurance.trim();
      if (normalizedInsurance) {
        updateData.insuranceProvider = normalizedInsurance.slice(0, 120);
        updateData.needsInsurance = false;
      }
    }

    if (profileUpdates.consultReason && doctor.businessType !== "RETAIL") {
      const normalizedReason = sanitizeReason(profileUpdates.consultReason, {
        allowSchedulingLike: true,
      });
      if (normalizedReason) {
        updateData.consultReason = normalizedReason;
        updateData.needsConsultReason = false;
      }
    }

    if (profileUpdates.dni) {
      const normalizedDni = normalizeDniInput(profileUpdates.dni);
      if (normalizedDni) {
        updateData.dni = normalizedDni;
        updateData.needsDni = false;
      }
    }

    if (profileUpdates.birthDate && doctor.businessType !== "RETAIL") {
      const parsedBirthDate = parseBirthDateInput(profileUpdates.birthDate);
      if (parsedBirthDate) {
        updateData.birthDate = parsedBirthDate;
        updateData.needsBirthDate = false;
      }
    }

    if (profileUpdates.address) {
      const cleanedAddress = profileUpdates.address.trim();
      if (cleanedAddress.length >= 5) {
        updateData.address = cleanedAddress.slice(0, 160);
        updateData.needsAddress = false;
      }
    }

    if (Object.keys(updateData).length > 0) {
      updatedPatient = await prisma.patient.update({
        where: { id: patient.id },
        data: updateData,
      });
    }
  }

  return {
    replyToPatient: agentResult.replyToPatient,
    action: agentResult.action,
    pendingSlotHint: agentResult.pendingSlotHint,
    patient: updatedPatient,
  } as HealthConversationResult;
}

export async function handleHealthWebhookMessage(params: {
  doctor: any;
  patient: Patient;
  bodyText: string;
  doctorNumber: string;
  phoneE164: string;
  doctorWhatsappConfig: any;
  recentMessages: { from: "patient" | "doctor"; text: string }[];
  availableSlots: AvailableSlot[];
  slotsForAgent: AvailableSlot[];
  productCatalog: string[];
  activeAppointment: ActiveAppointmentSummary;
  timezone: string;
}) {
  const {
    doctor,
    doctorNumber,
    phoneE164,
    doctorWhatsappConfig,
    recentMessages,
    availableSlots,
    slotsForAgent,
    productCatalog,
    activeAppointment,
    timezone,
  } = params;
  let { patient } = params;

  const flowResult = await handleConversationFlow({
    incomingText: params.bodyText,
    timezone,
    businessType: doctor.businessType as "HEALTH" | "BEAUTY" | "RETAIL",
    patient: {
      id: patient.id,
      fullName: patient.fullName,
      dni: patient.dni,
      birthDate: patient.birthDate ? patient.birthDate.toISOString() : null,
      address: patient.address,
      conversationState: patient.conversationState,
      conversationStateData: patient.conversationStateData ?? undefined,
      needsDni: patient.needsDni,
      needsName: patient.needsName,
      needsBirthDate: patient.needsBirthDate,
      needsAddress: patient.needsAddress,
      needsInsurance: patient.needsInsurance,
      needsConsultReason: patient.needsConsultReason,
      insuranceProvider: patient.insuranceProvider,
      consultReason: patient.consultReason,
    },
    availableSlots: slotsForAgent,
    activeAppointment,
    findPatientByDni: async (dni: string) =>
      prisma.patient.findFirst({
        where: { doctorId: doctor.id, dni },
        select: {
          id: true,
          fullName: true,
          needsDni: true,
          needsName: true,
          needsBirthDate: true,
          needsAddress: true,
          needsInsurance: true,
          needsConsultReason: true,
        },
      }),
  });

  if (flowResult.handled) {
    if (flowResult.mergeWithPatientId && flowResult.mergeWithPatientId !== patient.id) {
      patient = await mergePatientRecords({
        sourcePatientId: patient.id,
        targetPatientId: flowResult.mergeWithPatientId,
        phone: phoneE164,
      });
    }

    const updateData: Prisma.PatientUpdateInput = {};
    if (flowResult.patientProfilePatch) {
      const patch = flowResult.patientProfilePatch;
      if (patch.fullName) updateData.fullName = patch.fullName;
      if (patch.insuranceProvider !== undefined)
        updateData.insuranceProvider = patch.insuranceProvider;
      if (patch.consultReason !== undefined) updateData.consultReason = patch.consultReason;
      if (patch.dni !== undefined) updateData.dni = patch.dni;
      if (patch.birthDate !== undefined)
        updateData.birthDate = patch.birthDate ? new Date(patch.birthDate) : null;
      if (patch.address !== undefined) updateData.address = patch.address;
      if (typeof patch.needsName === "boolean") updateData.needsName = patch.needsName;
      if (typeof patch.needsDni === "boolean") updateData.needsDni = patch.needsDni;
      if (typeof patch.needsBirthDate === "boolean")
        updateData.needsBirthDate = patch.needsBirthDate;
      if (typeof patch.needsAddress === "boolean")
        updateData.needsAddress = patch.needsAddress;
      if (typeof patch.needsInsurance === "boolean")
        updateData.needsInsurance = patch.needsInsurance;
      if (typeof patch.needsConsultReason === "boolean")
        updateData.needsConsultReason = patch.needsConsultReason;
    }
    updateData.conversationState = flowResult.nextState;
    if (flowResult.stateData !== undefined) {
      if (flowResult.stateData) {
        updateData.conversationStateData = JSON.parse(
          JSON.stringify(flowResult.stateData)
        ) as Prisma.InputJsonValue;
      } else {
        updateData.conversationStateData = Prisma.JsonNull;
      }
    }

    if (Object.keys(updateData).length) {
      patient = await prisma.patient.update({
        where: { id: patient.id },
        data: updateData,
      });
    }

    let outgoingMessage = formatMenuMessage(flowResult.reply, flowResult.menu);

    if (flowResult.bookingRequest) {
      const bookingOutcome = await processBookingRequest({
        doctorId: doctor.id,
        patient,
        bookingRequest: flowResult.bookingRequest,
        availableSlots: slotsForAgent,
        timezone,
        fallbackReply: outgoingMessage,
      });
      patient = bookingOutcome.patient ?? patient;
      outgoingMessage = bookingOutcome.message;
    } else if (flowResult.cancelRequest) {
      const cancelOutcome = await processCancelRequest({
        doctorId: doctor.id,
        patient,
        cancelRequest: flowResult.cancelRequest,
        fallbackReply: outgoingMessage,
      });
      patient = cancelOutcome.patient ?? patient;
      outgoingMessage = cancelOutcome.message;
    }

    if (outgoingMessage) {
      const messageWithHint = appendMenuHintForBusiness(outgoingMessage, doctor.businessType);
      try {
        const waResult = await sendWhatsAppText(
          phoneE164,
          messageWithHint,
          doctorWhatsappConfig
        );
        await prisma.message.create({
          data: {
            waMessageId: (waResult as any)?.sid ?? null,
            from: doctorNumber,
            to: phoneE164,
            direction: "outgoing",
            type: "text",
            body: messageWithHint,
            rawPayload: waResult,
            patientId: patient.id,
            doctorId: doctor.id,
          },
        });
      } catch (error) {
        console.error("[HealthAgent] Error enviando respuesta:", error);
      }
    }

    return { patient };
  }

  const healthResult = await handleHealthConversation({
    text: params.bodyText,
    patient,
    doctor,
    recentMessages,
    productCatalog,
    availableSlots: slotsForAgent,
    timezone,
  });

  if (!healthResult) return null;

  const { replyToPatient, action, patient: updatedPatient } = healthResult;
  patient = updatedPatient;
  let outgoingMessage = replyToPatient;

  if (action.type === "CREATE_APPOINTMENT") {
    const pendingDataMissing = [];
    if (patient.needsDni) pendingDataMissing.push("tu DNI");
    if (patient.needsName) pendingDataMissing.push("tu nombre completo");
    if (patient.needsBirthDate) pendingDataMissing.push("tu fecha de nacimiento");
    if (patient.needsAddress) pendingDataMissing.push("tu dirección");
    if (patient.needsInsurance) pendingDataMissing.push("obra social/prepaga");
    if (patient.needsConsultReason) pendingDataMissing.push("el motivo de la consulta");

    if (pendingDataMissing.length) {
      outgoingMessage = `Antes de confirmar un turno necesito ${
        pendingDataMissing.length === 1
          ? pendingDataMissing[0]
          : `${pendingDataMissing.slice(0, -1).join(", ")} y ${
              pendingDataMissing[pendingDataMissing.length - 1]
            }`
      }. ¿Me lo compartís?`;
    } else {
      const matchingSlot = availableSlots.find((slot) => {
        const slotTime = new Date(slot.startISO).getTime();
        const actionTime = new Date(action.dateTimeISO).getTime();
        return !Number.isNaN(slotTime) && slotTime === actionTime;
      });

      if (!matchingSlot) {
        console.warn("[AI Turnos] Slot confirmado no coincide con disponibilidad", {
          requested: action.dateTimeISO,
        });
        outgoingMessage =
          "Ese horario no figura como disponible en el sistema. Decime de nuevo qué día y horario te sirve y te paso los turnos correctos 😊.";
      } else {
        const slotDate = new Date(matchingSlot.startISO);
        if (isNaN(slotDate.getTime())) {
          outgoingMessage =
            "No pude confirmar ese turno porque la hora no es válida. Decime nuevamente el horario que te sirve.";
        } else {
          const reason =
            sanitizeReason(action.reason, { allowSchedulingLike: true }) ||
            sanitizeReason(patient.pendingSlotReason, { allowSchedulingLike: true }) ||
            sanitizeReason(patient.consultReason, { allowSchedulingLike: true }) ||
            sanitizeReason(params.bodyText) ||
            "Consulta generada desde WhatsApp";

          const preferenceState = {
            preferredDayISO: patient.preferredDayISO ?? null,
            preferredHour: typeof patient.preferredHour === "number" ? patient.preferredHour : null,
          };

          if (!isSlotAlignedWithPreference(preferenceState, slotDate, timezone)) {
            const preferenceDesc = describePatientPreference(preferenceState, timezone);
            const slotLabel = formatSlotLabel(slotDate, timezone);
            outgoingMessage = preferenceDesc
              ? `Entendí que buscabas un turno ${preferenceDesc}, pero el horario disponible ahora es ${slotLabel}. ¿Te sirve igualmente o prefieres que busque otro?`
              : `El horario disponible es ${slotLabel}. ¿Querés que lo confirme o busco otro?`;
          } else {
            const existingFutureAppointment = await prisma.appointment.findFirst({
              where: {
                doctorId: doctor.id,
                patientId: patient.id,
                status: { in: ["scheduled", "confirmed"] },
                dateTime: {
                  gte: new Date(),
                },
              },
              orderBy: { dateTime: "asc" },
            });
            try {
              if (
                existingFutureAppointment &&
                areDatesWithinSameMinute(existingFutureAppointment.dateTime, slotDate)
              ) {
                await prisma.appointment.update({
                  where: { id: existingFutureAppointment.id },
                  data: {
                    type: reason || existingFutureAppointment.type,
                  },
                });
              } else {
                await prisma.appointment.create({
                  data: {
                    dateTime: slotDate,
                    type: reason || "Consulta generada desde WhatsApp",
                    status: "scheduled",
                    price: 0,
                    paid: false,
                    source: "whatsapp",
                    doctorId: doctor.id,
                    patientId: patient.id,
                  },
                });

                if (existingFutureAppointment) {
                  await prisma.appointment.update({
                    where: { id: existingFutureAppointment.id },
                    data: {
                      status: "cancelled_by_patient",
                    },
                  });
                }
              }

              patient = await prisma.patient.update({
                where: { id: patient.id },
                data: {
                  consultReason: reason,
                  needsConsultReason: !!reason ? false : patient.needsConsultReason,
                  pendingSlotISO: null,
                  pendingSlotHumanLabel: null,
                  pendingSlotExpiresAt: null,
                  pendingSlotReason: null,
                  preferredDayISO: startOfDayLocal(slotDate, timezone),
                  preferredHour: getMinutesOfDayLocal(slotDate, timezone),
                },
              });
            } catch (error) {
              console.error("[AI Turnos] Error creando turno:", error);
              outgoingMessage =
                "Intenté registrar ese turno pero hubo un problema. Probemos con otro horario o avisame si querés que te derive a recepción.";
            }
          }
        }
      }
    }
  }

  if (outgoingMessage) {
    const messageWithHint = appendMenuHintForBusiness(outgoingMessage, doctor.businessType);
    try {
      const waResult = await sendWhatsAppText(
        phoneE164,
        messageWithHint,
        doctorWhatsappConfig
      );

      await prisma.message.create({
        data: {
          waMessageId: (waResult as any)?.sid ?? null,
          from: doctorNumber,
          to: phoneE164,
          direction: "outgoing",
          type: "text",
          body: messageWithHint,
          rawPayload: waResult,
          patientId: patient.id,
          doctorId: doctor.id,
        },
      });
    } catch (error) {
      console.error("[HealthAgent] Error enviando respuesta del agente:", error);
    }
  }

  return { patient };
}

function formatMenuMessage(reply: string, menu?: MenuTemplate) {
  if (!menu) return reply;
  const lines = [reply];
  if (menu.options?.length) {
    for (const option of menu.options) {
      lines.push(`- ${option.label}`);
    }
  }
  return lines.join("\n");
}

const NON_BLOCKING_APPOINTMENT_STATUSES = Array.from([
  "cancelled_by_doctor",
  "cancelled_by_patient",
  "cancelled_by_no_show",
  "cancelled_by_system",
  "completed",
]);

type BookingRequestParams = {
  doctorId: number;
  patient: Patient;
  bookingRequest: BookingRequest;
  availableSlots: AvailableSlot[];
  timezone: string;
  fallbackReply: string;
};

async function processBookingRequest(
  params: BookingRequestParams
): Promise<{ message: string; patient?: Patient }> {
  const slot = params.availableSlots.find((s) => s.startISO === params.bookingRequest.slotISO);
  if (!slot) {
    return {
      message: "Ese horario ya no figura disponible. Elegí otro del calendario, por favor.",
    };
  }

  const slotDate = new Date(slot.startISO);
  if (isNaN(slotDate.getTime())) {
    return {
      message: "No pude leer el horario seleccionado. Probá nuevamente con otra opción.",
    };
  }

  if (params.bookingRequest.type === "book") {
    const conflicting = await prisma.appointment.findFirst({
      where: {
        doctorId: params.doctorId,
        dateTime: slotDate,
        status: { notIn: NON_BLOCKING_APPOINTMENT_STATUSES },
      },
    });
    if (conflicting) {
      return {
        message: "Ese turno se reservó recién. Elegí otro horario y lo confirmo al instante.",
      };
    }

    await prisma.appointment.create({
      data: {
        dateTime: slotDate,
        type:
          params.patient.consultReason || params.bookingRequest.slotLabel || "Consulta",
        status: "scheduled",
        price: 0,
        paid: false,
        source: "whatsapp",
        doctorId: params.doctorId,
        patientId: params.patient.id,
      },
    });

    return {
      message: `Listo ${params.patient.fullName.split(" ")[0]}, agendé tu turno ${slot.humanLabel}. Cualquier cambio avisame por acá.`,
    };
  }

  if (!params.bookingRequest.appointmentId) {
    return { message: params.fallbackReply };
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: params.bookingRequest.appointmentId,
      doctorId: params.doctorId,
      patientId: params.patient.id,
    },
  });

  if (!appointment) {
    return { message: params.fallbackReply };
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      dateTime: slotDate,
      status: appointment.status === "waiting" ? "waiting" : "scheduled",
    },
  });

  const label = formatSlotLabel(slotDate, params.timezone);
  return {
    message: `Reprogramé tu turno para ${label}. Quedó confirmado ✅`,
  };
}

type CancelRequestParams = {
  doctorId: number;
  patient: Patient;
  cancelRequest: CancelRequest;
  fallbackReply: string;
};

async function processCancelRequest(
  params: CancelRequestParams
): Promise<{ message: string; patient?: Patient }> {
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: params.cancelRequest.appointmentId,
      doctorId: params.doctorId,
      patientId: params.patient.id,
    },
  });
  if (!appointment) {
    return { message: params.fallbackReply };
  }

  if (appointment.status === "cancelled_by_patient") {
    return { message: "Ese turno ya estaba cancelado. ¿Querés agendar uno nuevo?" };
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "cancelled_by_patient" },
  });

  let updatedPatient: Patient | undefined;
  if (
    params.patient.pendingSlotISO &&
    areDatesWithinSameMinute(params.patient.pendingSlotISO, appointment.dateTime)
  ) {
    updatedPatient = await prisma.patient.update({
      where: { id: params.patient.id },
      data: {
        pendingSlotISO: null,
        pendingSlotHumanLabel: null,
        pendingSlotExpiresAt: null,
        pendingSlotReason: null,
      },
    });
  }

  return {
    message: "Listo, cancelé el turno. Si querés otro horario avisame y lo vemos.",
    ...(updatedPatient ? { patient: updatedPatient } : {}),
  };
}

function formatSlotLabel(date: Date, timezone: string) {
  try {
    return date.toLocaleString("es-AR", {
      timeZone: timezone,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return date.toISOString();
  }
}

function getMinutesOfDayLocal(date: Date, timezone: string) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return Number(lookup.hour) * 60 + Number(lookup.minute);
  } catch {
    return date.getHours() * 60 + date.getMinutes();
  }
}

function startOfDayLocal(date: Date, timezone: string) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const isoString = `${lookup.year}-${lookup.month}-${lookup.day}T00:00:00Z`;
    return new Date(isoString);
  } catch {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
}

function areDatesWithinSameMinute(a: Date, b: Date) {
  const diff = Math.abs(a.getTime() - b.getTime());
  return diff < 60000; // menos de un minuto
}

function formatMinutesAsHour(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function describePatientPreference(
  patient: { preferredDayISO: Date | null; preferredHour: number | null },
  timezone: string
) {
  const parts: string[] = [];
  if (patient.preferredDayISO) {
    parts.push(`para ${formatPreferredDayLabel(patient.preferredDayISO, timezone)}`);
  }
  if (typeof patient.preferredHour === "number") {
    const hourLabel = formatMinutesAsHour(patient.preferredHour);
    if (hourLabel) parts.push(`cerca de ${hourLabel}`);
  }
  if (!parts.length) return null;
  return parts.join(" ");
}

function isSameCalendarDayLocal(a: Date, b: Date, timezone: string) {
  return (
    startOfDayLocal(a, timezone).getTime() === startOfDayLocal(b, timezone).getTime()
  );
}

function isSlotAlignedWithPreference(
  patient: { preferredDayISO: Date | null; preferredHour: number | null },
  slotDate: Date,
  timezone: string
) {
  if (!patient.preferredDayISO && typeof patient.preferredHour !== "number") {
    return true;
  }
  if (patient.preferredDayISO) {
    if (!isSameCalendarDayLocal(slotDate, patient.preferredDayISO, timezone)) {
      return false;
    }
  }
  if (typeof patient.preferredHour === "number") {
    const slotMinutes = getMinutesOfDayLocal(slotDate, timezone);
    return Math.abs(slotMinutes - patient.preferredHour) <= 120; // +/- 2 horas
  }
  return true;
}

async function mergePatientRecords({
  sourcePatientId,
  targetPatientId,
  phone,
}: {
  sourcePatientId: number;
  targetPatientId: number;
  phone?: string | null;
}): Promise<Patient> {
  if (sourcePatientId === targetPatientId) {
    return prisma.patient.findUniqueOrThrow({
      where: { id: targetPatientId },
    });
  }

  await prisma.message.updateMany({
    where: { patientId: sourcePatientId },
    data: { patientId: targetPatientId },
  });
  await prisma.appointment.updateMany({
    where: { patientId: sourcePatientId },
    data: { patientId: targetPatientId },
  });
  await prisma.patientNote.updateMany({
    where: { patientId: sourcePatientId },
    data: { patientId: targetPatientId },
  });
  await prisma.patientDocument.updateMany({
    where: { patientId: sourcePatientId },
    data: { patientId: targetPatientId },
  });
  await prisma.patientTag.updateMany({
    where: { patientId: sourcePatientId },
    data: { patientId: targetPatientId },
  });

  await prisma.patient.delete({
    where: { id: sourcePatientId },
  });

  if (phone) {
    await prisma.patient.update({
      where: { id: targetPatientId },
      data: { phone },
    });
  }

  return prisma.patient.findUniqueOrThrow({
    where: { id: targetPatientId },
  });
}
// Helpers locales (fallback simples si faltan utilidades)
const normalizeAgentProvidedName = (name?: string | null) =>
  (name || "").trim();

const sanitizeReason = (reason?: string | null, _opts?: any) =>
  (reason || "").trim();

const parseBirthDateInput = (value?: string | null): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatPreferredDayLabel = (date: Date, timezone: string) => {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      weekday: "long",
      month: "short",
      day: "2-digit",
      timeZone: timezone,
    }).format(date);
  } catch {
    return date.toDateString();
  }
};
