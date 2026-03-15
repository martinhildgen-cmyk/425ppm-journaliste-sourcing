/**
 * TypeScript interfaces for the 425PPM LinkedIn sourcing extension.
 */

export interface Experience {
  title: string;
  company: string;
  dateRange: string;
  location: string;
}

export interface LinkedInProfile {
  name: string;
  headline: string;
  location: string;
  about: string;
  currentCompany: string;
  linkedinUrl: string;
  experiences: Experience[];
}

export interface RateLimiterState {
  profilesThisHour: number;
  profilesToday: number;
  lastHourReset: number;
  lastDayReset: number;
}

export interface ExtractedData {
  profile: LinkedInProfile;
  extractedAt: string;
}
