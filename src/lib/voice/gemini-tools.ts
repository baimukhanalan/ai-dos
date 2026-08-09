import type { Tool } from "@google/genai";

export const geminiLiveTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "search_clinic_knowledge",
        description:
          "Search the current clinic's published and approved knowledge base. Always use for doctor names, staff availability, doctor schedules, address, working hours, preparation instructions, policies and other clinic facts.",
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
          "Get authoritative published knowledge about doctor names and schedules together with structured booking records. Always prefer publishedKnowledge when names or schedules conflict with structuredDoctors. Use structuredDoctors only for an exact booking ID match.",
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
