import type { Tool } from "@google/genai";

export function geminiToolSuccessResponse(
  call: { id: string; name: string },
  result: unknown,
) {
  return {
    id: call.id,
    name: call.name,
    response: { result },
  };
}

export function geminiToolErrorResponse(
  call: { id: string; name: string },
  message: string,
) {
  return {
    id: call.id,
    name: call.name,
    response: { result: { error: message } },
  };
}

export const geminiLiveTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "search_clinic_knowledge",
        description:
          "Search the current clinic's published and approved knowledge base. For doctor or schedule questions it also returns activeDoctors and an exactDoctorAnswer generated from the current tenant schedule. Follow exactDoctorAnswer and never invent a name.",
        parametersJsonSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            query: { type: "string", minLength: 2, maxLength: 200 },
            locale: { type: "string", enum: ["ru", "kk", "en"] },
          },
          required: ["query"],
        },
      },
      {
        name: "list_clinic_services",
        description:
          "Get active clinic services, published prices and duration from the clinic database.",
        parametersJsonSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            query: { type: "string", minLength: 2, maxLength: 120 },
          },
        },
      },
      {
        name: "list_doctors",
        description:
          "Get the current tenant's active doctors, exact weekly schedules and published knowledge. Read exactDoctorAnswer faithfully: do not replace exact hours with morning/afternoon and never name a doctor absent from activeDoctors. Use each activeDoctors id only after matching that exact doctor for booking.",
        parametersJsonSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            specialty: { type: "string", minLength: 2, maxLength: 120 },
          },
        },
      },
      {
        name: "find_available_slots",
        description:
          "Find concrete currently available appointment slots for a doctor. doctorId must come from list_doctors.",
        parametersJsonSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            doctorId: { type: "string", format: "uuid" },
            days: { type: "integer", minimum: 1, maximum: 14 },
          },
          required: ["doctorId"],
        },
      },
      {
        name: "list_clinic_branches",
        description:
          "Get active clinic branches with their exact addresses and phone numbers.",
        parametersJsonSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
      {
        name: "verify_patient_identity",
        description:
          "Verify a patient before booking or accessing appointment data. Ask for phone plus surname or date of birth, then pass exactly those values. The result exposes only a status and, on success, a patientId for booking_turn.",
        parametersJsonSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            phone: { type: "string", minLength: 7, maxLength: 24 },
            surname: { type: "string", minLength: 2, maxLength: 120 },
            birthDate: {
              type: "string",
              pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            },
          },
          required: ["phone"],
        },
      },
      {
        name: "booking_turn",
        description:
          "Drive the clinic's conversational booking flow one turn at a time. Pass the patient's exact words; the flow picks the doctor, offers concrete slots, books through the clinic system and records the outcome. Never claim the appointment is made unless the response outcome is 'booked'. Booking can only complete for an identified patient — pass patientId once identity is confirmed, otherwise the flow hands the call to a human.",
        parametersJsonSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            message: { type: "string", minLength: 1, maxLength: 1000 },
            patientId: { type: "string", format: "uuid" },
          },
          required: ["message"],
        },
      },
      {
        name: "patient_appointment_turn",
        description:
          "List, cancel or reschedule an identified patient's existing appointments. Pass the patient's exact words and the verified patientId on every turn. The tool asks for appointment selection, real slots and explicit confirmation. Never claim a change unless outcome is 'completed'.",
        parametersJsonSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            message: { type: "string", minLength: 1, maxLength: 1000 },
            patientId: { type: "string", format: "uuid" },
            language: { type: "string", enum: ["ru", "kk", "en"] },
          },
          required: ["message", "patientId"],
        },
      },
      {
        name: "create_callback_request",
        description:
          "Create a callback task for clinic staff only after the patient explicitly confirms their phone number and asks for a callback.",
        parametersJsonSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 2, maxLength: 120 },
            phone: { type: "string", minLength: 7, maxLength: 24 },
            reason: { type: "string", minLength: 3, maxLength: 500 },
            preferredTime: { type: "string", maxLength: 120 },
            priority: {
              type: "string",
              enum: ["normal", "high", "urgent"],
            },
            confirmed: { type: "boolean" },
          },
          required: ["name", "phone", "reason", "confirmed"],
        },
      },
    ],
  },
];
