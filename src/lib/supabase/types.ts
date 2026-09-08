export type SubjectCategory = "academic" | "games";
export type TeacherGroup = "A" | "B";
export type AbsenceStatus = "full_day" | "partial";
export type AssignmentMethod = "auto" | "manual";
export type SubstitutionStatus =
  | "pending"
  | "assigned"
  | "flagged_for_review"
  | "confirmed"
  | "cancelled";

export type Role = "admin" | "teacher";

export type Class = {
  id: string;
  name: string;
  stream: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export type Section = {
  id: string;
  class_id: string;
  name: string;
  class_teacher_id: string | null;
  created_at: string;
  updated_at: string;
}

export type Subject = {
  id: string;
  name: string;
  category: SubjectCategory;
  created_at: string;
  updated_at: string;
}

export type Teacher = {
  id: string;
  name: string;
  email: string;
  username: string;
  real_email: string | null;
  real_email_verified: boolean;
  phone: string | null;
  is_active: boolean;
  group: TeacherGroup;
  group_needs_review: boolean;
  created_at: string;
  updated_at: string;
}

export type TeacherSubject = {
  id: string;
  teacher_id: string;
  subject_id: string;
  is_primary: boolean;
  created_at: string;
}

export type PeriodSlot = {
  id: string;
  period_number: number;
  label: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  created_at: string;
  updated_at: string;
}

export type TimetableEntry = {
  id: string;
  section_id: string;
  day_of_week: number;
  period_slot_id: string;
  subject_id: string | null;
  teacher_id: string | null;
  is_practical: boolean;
  created_at: string;
  updated_at: string;
}

export type TeacherAbsence = {
  id: string;
  teacher_id: string;
  date: string;
  reported_at: string;
  reported_by: string | null;
  status: AbsenceStatus;
  affected_periods: number[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type Substitution = {
  id: string;
  absence_id: string;
  timetable_entry_id: string;
  date: string;
  substitute_teacher_id: string | null;
  assignment_method: AssignmentMethod;
  is_exception_fallback: boolean;
  status: SubstitutionStatus;
  created_by: string | null;
  notified_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type SubstitutionRule = {
  id: string;
  rule_key: string;
  priority_order: number;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type TableDef<Row, Relationships extends Relationship[] = []> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: Relationships;
};

// Foreign key names below follow Postgres's default `<table>_<column>_fkey`
// naming (as used in the migration) — needed so PostgREST's embedded-resource
// selects (e.g. `sections(name)` from `classes`) type-check correctly.
export type Database = {
  public: {
    Tables: {
      classes: TableDef<Class>;
      sections: TableDef<
        Section,
        [
          {
            foreignKeyName: "sections_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sections_class_teacher_id_fkey";
            columns: ["class_teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ]
      >;
      subjects: TableDef<Subject>;
      teachers: TableDef<Teacher>;
      teacher_subjects: TableDef<
        TeacherSubject,
        [
          {
            foreignKeyName: "teacher_subjects_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_subjects_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
        ]
      >;
      period_slots: TableDef<PeriodSlot>;
      timetable_entries: TableDef<
        TimetableEntry,
        [
          {
            foreignKeyName: "timetable_entries_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timetable_entries_period_slot_id_fkey";
            columns: ["period_slot_id"];
            isOneToOne: false;
            referencedRelation: "period_slots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timetable_entries_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timetable_entries_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ]
      >;
      teacher_absences: TableDef<
        TeacherAbsence,
        [
          {
            foreignKeyName: "teacher_absences_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_absences_reported_by_fkey";
            columns: ["reported_by"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ]
      >;
      substitutions: TableDef<
        Substitution,
        [
          {
            foreignKeyName: "substitutions_absence_id_fkey";
            columns: ["absence_id"];
            isOneToOne: false;
            referencedRelation: "teacher_absences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "substitutions_timetable_entry_id_fkey";
            columns: ["timetable_entry_id"];
            isOneToOne: false;
            referencedRelation: "timetable_entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "substitutions_substitute_teacher_id_fkey";
            columns: ["substitute_teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "substitutions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ]
      >;
      substitution_rules: TableDef<SubstitutionRule>;
    };
    // Plain `{}` (not Record<string, never>) — a Record type carries an
    // implicit string index signature, which would make every table name
    // also match `keyof Views`/`keyof Functions` and break overload
    // resolution on `.from(...)`.
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
}
