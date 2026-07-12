export interface TrackingEvent {
  location?: string;
  description?: string;
  date?: string;
  translatedDescription?: string;
  /** Raw original description before translation — used for dedup hashing */
  rawDescription?: string;
}

export interface TrackingInfo {
  trackingNumber: string;
  carrier?: string;
  status: "active" | "delivered" | "exception" | "unknown";
  events: TrackingEvent[];
}

export interface RegisterResult {
  success: boolean;
  trackingNumber: string;
  error?: string;
}

export interface ITrackingClient {
  /**
   * Register a tracking number with 17Track.
   * Requests English translation via translation_mode=UseThirdPartyServices, lang=en.
   */
  register(trackingNumber: string, email?: string): Promise<RegisterResult>;

  /**
   * Get tracking info for one or more tracking numbers.
   * Returns a Map keyed by tracking number.
   */
  getTrackInfo(numbers: string[]): Promise<Map<string, TrackingInfo>>;
}
