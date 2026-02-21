// worker/src/broker/BrokerCapabilities.ts
export type BrokerCapabilities = {
  // Can the broker submit entry + brackets in one call?
  supportsBracketInSingleCall: boolean;

  // If not, can it place entry first, then attach brackets after entry is accepted/filled?
  supportsAttachBracketsAfterEntry: boolean;

  // Some brokers require stop/tp ticks to be "signed" relative to side (ProjectX)
  requiresSignedBracketTicks: boolean;
};
