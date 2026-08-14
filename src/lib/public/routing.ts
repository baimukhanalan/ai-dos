export function isCallbackRequest(message: string) {
  return /обратн.{0,10}звон|перезвон|кері\s+қоңырау|callback/i.test(message);
}

export function isExplicitBookingRequest(message: string) {
  return /запиш|хочу\s+(?:на\s+)?при[её]м|заброниру|book\s+(?:me|an?\s+appointment)|жазып\s+қой|жазылғым/i.test(
    message,
  );
}
