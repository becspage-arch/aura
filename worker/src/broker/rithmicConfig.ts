export type RithmicConfig = {
  username: string;
  password: string;
  system: string;
  host: string;
  port: number;
};

export function getRithmicConfig(): RithmicConfig {
  const {
    RITHMIC_USERNAME,
    RITHMIC_PASSWORD,
    RITHMIC_SYSTEM,
    RITHMIC_HOST,
    RITHMIC_PORT,
  } = process.env;

  if (
    !RITHMIC_USERNAME ||
    !RITHMIC_PASSWORD ||
    !RITHMIC_SYSTEM ||
    !RITHMIC_HOST ||
    !RITHMIC_PORT
  ) {
    throw new Error("Missing Rithmic environment variables");
  }

  return {
    username: RITHMIC_USERNAME,
    password: RITHMIC_PASSWORD,
    system: RITHMIC_SYSTEM,
    host: RITHMIC_HOST,
    port: Number(RITHMIC_PORT),
  };
}
