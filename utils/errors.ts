export class CompanyError extends Error {
  constructor(
    public readonly role: string,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CompanyError";
  }
}

export class PlatformError extends CompanyError {
  constructor(
    platform: string,
    code: string,
    message: string,
    public readonly statusCode?: number,
  ) {
    super(platform, code, message);
    this.name = "PlatformError";
  }
}

export class BrainError extends CompanyError {
  constructor(message: string) {
    super("brain", "BRAIN_ERROR", message);
    this.name = "BrainError";
  }
}
