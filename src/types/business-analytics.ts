import type { AppointmentStatus } from "@/db/schema/appointments";

export type AnalyticsRangePreset = "TODAY" | "LAST_7_DAYS" | "LAST_30_DAYS";

export interface AnalyticsDateRange {
  preset: AnalyticsRangePreset;
  timeZone: string;
  startDateStr: string; // YYYY-MM-DD
  endDateStr: string;   // YYYY-MM-DD (inclusive)
  startInstant: Date;   // Start of startDateStr in timeZone
  endInstant: Date;     // Start of day after endDateStr in timeZone (half-open [start, end))
  daysCount: number;    // 1, 7, 30
  localDates: string[]; // Ordered list of YYYY-MM-DD in range
}

export interface CurrencyAmount {
  currency: string;
  amount: string; // e.g. "1250.00"
}

export interface TodaySummary {
  totalAppointments: number;
  pendingAppointments: number;
  confirmedAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
}

export interface NextAppointmentSummary {
  id: string;
  startTime: Date;
  endTime: Date;
  localStartTime: string; // "14:30"
  localEndTime: string;   // "15:15"
  status: AppointmentStatus;
  customerName: string;
  serviceName: string;
  staffName: string;
}

export interface UpcomingSummary {
  nextAppointment: NextAppointmentSummary | null;
  remainingToday: number;
  tomorrowCount: number;
  next7DaysCount: number;
}

export interface RangeSummary {
  totalAppointments: number;
  pendingAppointments: number;
  confirmedAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  operationalAppointments: number; // pending + confirmed
  completedServiceValue: CurrencyAmount[];
  uniqueCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  cancellationRate: number | null; // 0..1 or null if 0 denominator
  noShowRate: number | null;        // 0..1 or null if 0 denominator
}

export interface DailyTrendBucket {
  localDate: string; // YYYY-MM-DD
  appointmentCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  completedServiceValue: CurrencyAmount[];
}

export interface ServiceAnalyticsItem {
  serviceId: string;
  serviceName: string; // snapshot name
  appointmentCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  completedServiceValue: CurrencyAmount[];
}

export interface StaffAnalyticsItem {
  staffId: string;
  staffName: string;
  appointmentCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  completedServiceValue: CurrencyAmount[];
}

export interface BusyPeriodWeekdayItem {
  dayOfWeek: number; // 1 = Monday, 7 = Sunday (ISO)
  dayName: string;   // "Pazartesi", "Salı", ...
  appointmentCount: number;
}

export interface BusyPeriodHourItem {
  hour: number;      // 0..23 local hour
  appointmentCount: number;
}

export interface BusyPeriodsSummary {
  byWeekday: BusyPeriodWeekdayItem[];
  byHour: BusyPeriodHourItem[];
}

export interface BusinessDashboardAnalytics {
  businessId: string;
  businessName: string;
  currency: string;
  timezone: string;
  generatedAt: string; // ISO string
  selectedRange: AnalyticsDateRange;
  todaySummary: TodaySummary;
  upcomingSummary: UpcomingSummary;
  rangeSummary: RangeSummary;
  dailyTrend: DailyTrendBucket[];
  topServices: ServiceAnalyticsItem[];
  staffPerformance: StaffAnalyticsItem[];
  busyPeriods: BusyPeriodsSummary;
}
