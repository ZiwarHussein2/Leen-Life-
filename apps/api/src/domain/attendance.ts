/** Geofenced attendance and payroll calculations (spec §19.4, §18.4). */

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Haversine distance in meters. */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function isInsideGeofence(point: GeoPoint, center: GeoPoint, radiusMeters: number): boolean {
  return distanceMeters(point, center) <= radiusMeters;
}

export interface WorkWindow {
  /** "HH:MM" scheduled start */
  startTime: string;
  /** "HH:MM" scheduled end */
  endTime: string;
  /** grace period before lateness counts */
  graceMinutes?: number;
}

export interface AttendanceCalc {
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function computeAttendance(
  checkInAt: Date,
  checkOutAt: Date | null,
  window: WorkWindow,
): AttendanceCalc {
  const grace = window.graceMinutes ?? 15;
  const start = hhmmToMinutes(window.startTime);
  const end = hhmmToMinutes(window.endTime);
  const inMin = checkInAt.getHours() * 60 + checkInAt.getMinutes();
  const rawLate = inMin - start;
  const lateMinutes = rawLate > grace ? rawLate : 0;

  let earlyLeaveMinutes = 0;
  let overtimeMinutes = 0;
  if (checkOutAt) {
    const outMin = checkOutAt.getHours() * 60 + checkOutAt.getMinutes();
    if (outMin < end) earlyLeaveMinutes = end - outMin;
    else overtimeMinutes = outMin - end;
  }
  return { lateMinutes, earlyLeaveMinutes, overtimeMinutes };
}

export interface PayrollRules {
  /** Deduction per late minute in IQD (after grace). */
  latePerMinute: number;
  /** Deduction per early-leave minute in IQD. */
  earlyLeavePerMinute: number;
  /** Overtime pay per minute in IQD. */
  overtimePerMinute: number;
  /** Deduction per full absent day in IQD. */
  absentDayDeduction: number;
}

export function computePayroll(
  baseSalary: number,
  records: { lateMinutes: number; earlyLeaveMinutes: number; overtimeMinutes: number; absent?: boolean }[],
  rules: PayrollRules,
): { deductionAmount: number; overtimeAmount: number; netSalary: number } {
  let deduction = 0;
  let overtime = 0;
  for (const r of records) {
    if (r.absent) {
      deduction += rules.absentDayDeduction;
      continue;
    }
    deduction += r.lateMinutes * rules.latePerMinute;
    deduction += r.earlyLeaveMinutes * rules.earlyLeavePerMinute;
    overtime += r.overtimeMinutes * rules.overtimePerMinute;
  }
  deduction = Math.min(deduction, baseSalary);
  return {
    deductionAmount: deduction,
    overtimeAmount: overtime,
    netSalary: baseSalary - deduction + overtime,
  };
}
