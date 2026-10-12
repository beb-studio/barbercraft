import "server-only";

import { getBusinessById } from "@/repositories/business.repository";
import { BusinessAnalyticsRepository } from "@/repositories/business-analytics.repository";
import {
  getAnalyticsDateRange,
  getTurkishWeekdayName,
  isValidAnalyticsPreset,
  shiftDateStr,
} from "@/lib/business-analytics/range";
import {
  formatInstantInBusinessTimezone,
  getBusinessLocalToday,
  getLocalDayBounds,
} from "@/lib/timezone";
import type {
  AnalyticsRangePreset,
  BusinessDashboardAnalytics,
  CurrencyAmount,
  DailyTrendBucket,
  NextAppointmentSummary,
  RangeSummary,
  ServiceAnalyticsItem,
  StaffAnalyticsItem,
  TodaySummary,
  UpcomingSummary,
} from "@/types/business-analytics";

export class BusinessAnalyticsError extends Error {
  constructor(
    message: string,
    public readonly code: "BUSINESS_NOT_FOUND" | "INVALID_PRESET" | "INTERNAL_ERROR"
  ) {
    super(message);
    this.name = "BusinessAnalyticsError";
  }
}

function normalizeDecimalString(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "0.00";
  const num = typeof val === "number" ? val : parseFloat(val);
  if (isNaN(num)) return "0.00";
  return num.toFixed(2);
}

export class BusinessAnalyticsService {
  /**
   * Generates the complete BusinessDashboardAnalytics read model for a tenant and preset.
   */
  static async getDashboardAnalytics(params: {
    businessId: string;
    preset?: AnalyticsRangePreset;
    referenceNow?: Date;
  }): Promise<BusinessDashboardAnalytics> {
    const { businessId, referenceNow = new Date() } = params;
    const preset: AnalyticsRangePreset =
      params.preset && isValidAnalyticsPreset(params.preset) ? params.preset : "LAST_7_DAYS";

    const business = await getBusinessById(businessId);
    if (!business) {
      throw new BusinessAnalyticsError("İşletme bulunamadı.", "BUSINESS_NOT_FOUND");
    }

    const timeZone = business.timezone || "Europe/Istanbul";
    const currency = business.currency || "TRY";

    // 1. Resolve Range & Windows
    const selectedRange = getAnalyticsDateRange(preset, timeZone, referenceNow);

    const todayStr = getBusinessLocalToday(timeZone, referenceNow);
    const todayBounds = getLocalDayBounds(todayStr, timeZone);

    const tomorrowStr = shiftDateStr(todayStr, 1);
    const tomorrowBounds = getLocalDayBounds(tomorrowStr, timeZone);

    const day7Str = shiftDateStr(todayStr, 7);
    const next7End = getLocalDayBounds(day7Str, timeZone).end;

    // 2. Parallel Query Aggregation
    const [
      rawTodayUpcoming,
      rawNextApp,
      rawRangeSummary,
      newCustomersCount,
      rawDailyTrend,
      rawTopServices,
      rawStaff,
      rawWeekdays,
      rawHours,
    ] = await Promise.all([
      BusinessAnalyticsRepository.getTodayAndUpcomingCounts({
        businessId,
        todayStart: todayBounds.start,
        todayEnd: todayBounds.end,
        referenceNow,
        tomorrowStart: tomorrowBounds.start,
        tomorrowEnd: tomorrowBounds.end,
        next7Start: tomorrowBounds.start,
        next7End,
      }),
      BusinessAnalyticsRepository.getNextAppointment({
        businessId,
        referenceNow,
      }),
      BusinessAnalyticsRepository.getRangeSummary({
        businessId,
        rangeStart: selectedRange.startInstant,
        rangeEnd: selectedRange.endInstant,
      }),
      BusinessAnalyticsRepository.getNewCustomersCount({
        businessId,
        rangeStart: selectedRange.startInstant,
        rangeEnd: selectedRange.endInstant,
      }),
      BusinessAnalyticsRepository.getDailyTrend({
        businessId,
        rangeStart: selectedRange.startInstant,
        rangeEnd: selectedRange.endInstant,
        timeZone,
      }),
      BusinessAnalyticsRepository.getTopServices({
        businessId,
        rangeStart: selectedRange.startInstant,
        rangeEnd: selectedRange.endInstant,
        limit: 5,
      }),
      BusinessAnalyticsRepository.getStaffPerformance({
        businessId,
        rangeStart: selectedRange.startInstant,
        rangeEnd: selectedRange.endInstant,
      }),
      BusinessAnalyticsRepository.getBusyPeriodWeekdays({
        businessId,
        rangeStart: selectedRange.startInstant,
        rangeEnd: selectedRange.endInstant,
        timeZone,
      }),
      BusinessAnalyticsRepository.getBusyPeriodHours({
        businessId,
        rangeStart: selectedRange.startInstant,
        rangeEnd: selectedRange.endInstant,
        timeZone,
      }),
    ]);

    // 3. Shape Today Summary
    const todaySummary: TodaySummary = {
      totalAppointments: rawTodayUpcoming.totalToday,
      pendingAppointments: rawTodayUpcoming.pendingToday,
      confirmedAppointments: rawTodayUpcoming.confirmedToday,
      completedAppointments: rawTodayUpcoming.completedToday,
      cancelledAppointments: rawTodayUpcoming.cancelledToday,
      noShowAppointments: rawTodayUpcoming.noShowToday,
    };

    // 4. Shape Next & Upcoming Summary
    let nextAppointment: NextAppointmentSummary | null = null;
    if (rawNextApp) {
      const formattedTimes = formatInstantInBusinessTimezone(rawNextApp.startTime, timeZone);
      const formattedEndTime = formatInstantInBusinessTimezone(rawNextApp.endTime, timeZone);

      nextAppointment = {
        id: rawNextApp.id,
        startTime: rawNextApp.startTime,
        endTime: rawNextApp.endTime,
        localStartTime: formattedTimes.timeStr,
        localEndTime: formattedEndTime.timeStr,
        status: rawNextApp.status,
        customerName: `${rawNextApp.customerFirstName} ${rawNextApp.customerLastName ?? ""}`.trim(),
        serviceName: rawNextApp.serviceName,
        staffName: `${rawNextApp.staffFirstName} ${rawNextApp.staffLastName}`.trim(),
      };
    }

    const upcomingSummary: UpcomingSummary = {
      nextAppointment,
      remainingToday: rawTodayUpcoming.remainingToday,
      tomorrowCount: rawTodayUpcoming.tomorrowCount,
      next7DaysCount: rawTodayUpcoming.next7DaysCount,
    };

    // 5. Shape Range Summary with Rate Calculations
    const terminalOrCancelledCount =
      rawRangeSummary.completedAppointments +
      rawRangeSummary.noShowAppointments +
      rawRangeSummary.cancelledAppointments;

    const cancellationRate =
      terminalOrCancelledCount > 0
        ? Number((rawRangeSummary.cancelledAppointments / terminalOrCancelledCount).toFixed(4))
        : null;

    const attendedOrNoShowCount =
      rawRangeSummary.completedAppointments + rawRangeSummary.noShowAppointments;

    const noShowRate =
      attendedOrNoShowCount > 0
        ? Number((rawRangeSummary.noShowAppointments / attendedOrNoShowCount).toFixed(4))
        : null;

    const completedServiceValue: CurrencyAmount[] = [
      {
        currency,
        amount: normalizeDecimalString(rawRangeSummary.completedServiceValue),
      },
    ];

    const returningCustomers = Math.max(0, rawRangeSummary.uniqueCustomers - newCustomersCount);

    const rangeSummary: RangeSummary = {
      totalAppointments: rawRangeSummary.totalAppointments,
      pendingAppointments: rawRangeSummary.pendingAppointments,
      confirmedAppointments: rawRangeSummary.confirmedAppointments,
      completedAppointments: rawRangeSummary.completedAppointments,
      cancelledAppointments: rawRangeSummary.cancelledAppointments,
      noShowAppointments: rawRangeSummary.noShowAppointments,
      operationalAppointments:
        rawRangeSummary.pendingAppointments + rawRangeSummary.confirmedAppointments,
      completedServiceValue,
      uniqueCustomers: rawRangeSummary.uniqueCustomers,
      newCustomers: newCustomersCount,
      returningCustomers,
      cancellationRate,
      noShowRate,
    };

    // 6. Zero-Fill Daily Trend
    const trendMap = new Map(rawDailyTrend.map((row) => [row.localDate, row]));
    const dailyTrend: DailyTrendBucket[] = selectedRange.localDates.map((localDate) => {
      const found = trendMap.get(localDate);
      return {
        localDate,
        appointmentCount: found?.appointmentCount ?? 0,
        completedCount: found?.completedCount ?? 0,
        cancelledCount: found?.cancelledCount ?? 0,
        noShowCount: found?.noShowCount ?? 0,
        completedServiceValue: [
          {
            currency,
            amount: normalizeDecimalString(found?.completedServiceValue ?? "0.00"),
          },
        ],
      };
    });

    // 7. Top Services
    const topServices: ServiceAnalyticsItem[] = rawTopServices.map((row) => ({
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      appointmentCount: row.appointmentCount,
      completedCount: row.completedCount,
      cancelledCount: row.cancelledCount,
      noShowCount: row.noShowCount,
      completedServiceValue: [
        {
          currency,
          amount: normalizeDecimalString(row.completedServiceValue),
        },
      ],
    }));

    // 8. Staff Performance
    const staffPerformance: StaffAnalyticsItem[] = rawStaff.map((row) => ({
      staffId: row.staffId,
      staffName: `${row.firstName} ${row.lastName}`.trim() || "Bilinmeyen Personel",
      appointmentCount: row.appointmentCount,
      completedCount: row.completedCount,
      cancelledCount: row.cancelledCount,
      noShowCount: row.noShowCount,
      completedServiceValue: [
        {
          currency,
          amount: normalizeDecimalString(row.completedServiceValue),
        },
      ],
    }));

    // 9. Busy Periods (Fill all weekdays 1..7 and hours 0..23)
    const weekdayMap = new Map(rawWeekdays.map((row) => [row.dayOfWeek, row.appointmentCount]));
    const byWeekday = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
      dayOfWeek,
      dayName: getTurkishWeekdayName(dayOfWeek),
      appointmentCount: weekdayMap.get(dayOfWeek) ?? 0,
    }));

    const hourMap = new Map(rawHours.map((row) => [row.hour, row.appointmentCount]));
    const byHour = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      appointmentCount: hourMap.get(i) ?? 0,
    }));

    return {
      businessId,
      businessName: business.name,
      currency,
      timezone: timeZone,
      generatedAt: referenceNow.toISOString(),
      selectedRange,
      todaySummary,
      upcomingSummary,
      rangeSummary,
      dailyTrend,
      topServices,
      staffPerformance,
      busyPeriods: {
        byWeekday,
        byHour,
      },
    };
  }
}
