import type { AppointmentStatus, AppointmentSource } from "./appointment";
import type { TimeBlockType } from "@/db/schema";

export type StaffWorkspaceRangePreset = "TODAY" | "SELECTED_DAY" | "CURRENT_WEEK";

export interface StaffWorkspaceProfile {
  staffId: string;
  firstName: string;
  lastName: string | null;
  title: string | null;
  photoUrl: string | null;
  isPublicBookingEnabled: boolean;
  isActive: boolean;
}

export interface StaffWorkspaceBusiness {
  businessId: string;
  businessName: string;
  timezone: string;
  localTodayDate: string; // YYYY-MM-DD in business timezone
}

export interface StaffWorkspaceOperationalPulse {
  todayDate: string; // YYYY-MM-DD
  totalAppointmentsToday: number;
  remainingAppointmentsToday: number;
  completedToday: number;
  cancelledToday: number;
  noShowToday: number;
  weekTotalAppointments: number;
  weekCompletedAppointments: number;
  // NOTE: Zero financial exposure. No service prices, revenue, or earnings.
}

export interface StaffWorkspaceCustomer {
  firstName: string;
  lastName: string | null;
  phone: string;
}

export interface StaffWorkspaceAllowedActions {
  canComplete: boolean;
  canMarkNoShow: boolean;
  canCancel: boolean;
  canReschedule: boolean;
  canReassign: false; // STRICT INVARIANT: Always false for staff
}

export interface StaffWorkspaceAgendaAppointment {
  appointmentId: string;
  startAt: string; // ISO string
  endAt: string; // ISO string
  localStartTime: string; // HH:mm
  localEndTime: string; // HH:mm
  localDate: string; // YYYY-MM-DD
  status: AppointmentStatus;
  source: AppointmentSource;
  updatedAt: string; // ISO string for optimistic concurrency
  customer: StaffWorkspaceCustomer;
  service: {
    name: string;
    durationMinutes: number;
  };
  allowedActions: StaffWorkspaceAllowedActions;
}

export interface StaffWorkspaceTimeBlock {
  id: string;
  blockType: TimeBlockType;
  startTime: string; // ISO string
  endTime: string; // ISO string
  localStartTime: string; // HH:mm
  localEndTime: string; // HH:mm
  localDate: string; // YYYY-MM-DD
  reason: string | null;
  isPast: boolean;
}

export interface StaffWorkspaceWorkingHours {
  startTime: string;
  endTime: string;
}

export interface StaffWorkspaceDayAgenda {
  dateStr: string; // YYYY-MM-DD
  dayOfWeek: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  dayName: string; // "Pazartesi", "Salı", etc.
  isWorkingDay: boolean;
  workingHours: StaffWorkspaceWorkingHours | null;
  appointments: StaffWorkspaceAgendaAppointment[];
  timeBlocks: StaffWorkspaceTimeBlock[];
  totalAppointments: number;
  completedAppointments: number;
}

export interface StaffWorkspaceAssignedService {
  id: string;
  name: string;
  durationMinutes: number;
  active: boolean;
}

export interface StaffWorkspaceNextAppointment {
  appointmentId: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  startTime: string; // ISO
  endTime: string; // ISO
  localStartTime: string; // HH:mm
  localEndTime: string; // HH:mm
  localDate: string; // YYYY-MM-DD
  status: AppointmentStatus;
  updatedAt: string;
}

export interface StaffWorkspaceData {
  profile: StaffWorkspaceProfile;
  business: StaffWorkspaceBusiness;
  pulse: StaffWorkspaceOperationalPulse;
  nextAppointment: StaffWorkspaceNextAppointment | null;
  selectedDayAgenda: StaffWorkspaceDayAgenda;
  currentWeekAgenda: StaffWorkspaceDayAgenda[]; // 7 days, Monday to Sunday in business timezone
  assignedServices: StaffWorkspaceAssignedService[];
  personalTimeBlocks: StaffWorkspaceTimeBlock[];
}
