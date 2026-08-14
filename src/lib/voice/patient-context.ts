export function isVerifiedVoicePatient(
  boundPatientId: string | null,
  requestedPatientId: string | undefined,
  requireExplicitMatch = false,
) {
  if (!boundPatientId) return false;
  if (requireExplicitMatch && !requestedPatientId) return false;
  return !requestedPatientId || requestedPatientId === boundPatientId;
}
