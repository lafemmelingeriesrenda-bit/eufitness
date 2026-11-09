// Tipos do banco. Escrito à mão a partir de supabase/migrations; quando o
// projeto estiver ligado, regenere com:
//   npx supabase gen types typescript --project-id ublmnybcognkqcnpqpnz > app/types/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type MemberRole = 'personal' | 'nutri' | 'aluno'
export type LinkStatus = 'ativo' | 'pausado' | 'encerrado'
export type PlanKindDb = 'treino' | 'dieta'

/** O que o painel /admin recebe de admin_overview(). */
export type AdminOverview = {
  organizations: {
    id: string
    name: string
    created_at: string
    owner_name: string
    owner_email: string
    personais: number
    nutris: number
    alunos: number
    anamneses_enviadas: number
  }[]
  users: {
    id: string
    full_name: string
    email: string
    phone: string | null
    created_at: string | null
    last_sign_in_at: string | null
    confirmed: boolean
    roles: { organization: string; role: MemberRole; is_admin: boolean }[]
  }[]
}

/** Respostas da anamnese (fase 2). Tudo pode ficar vazio até o envio. */
export type AnamneseAnswers = {
  goal: 'emagrecer' | 'massa' | 'condicionamento' | 'saude' | null
  goal_notes: string | null
  sex: 'feminino' | 'masculino' | null
  birth_date: string | null
  height_cm: number | null
  weight_kg: number | null
  training_days: number | null
  training_place: 'academia' | 'casa' | 'livre' | null
  session_minutes: number | null
  training_time: 'manha' | 'tarde' | 'noite' | 'variado' | null
  experience: 'iniciante' | 'intermediario' | 'avancado' | null
  pain: string | null
  conditions: string | null
  medications: string | null
  diet_restrictions: string | null
  food_dislikes: string | null
  meals_per_day: number | null
  water_liters: number | null
  activity_level: 'sedentario' | 'leve' | 'moderado' | 'intenso' | null
  sleep_hours: number | null
  notes: string | null
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          phone: string | null
          timezone: string
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: {
          full_name?: string
          phone?: string | null
          timezone?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          id: string
          name: string
          owner_id: string
          created_at: string
        }
        Insert: never
        Update: { name?: string }
        Relationships: []
      }
      memberships: {
        Row: {
          organization_id: string
          user_id: string
          role: MemberRole
          is_admin: boolean
          registry: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'memberships_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'memberships_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      coach_students: {
        Row: {
          organization_id: string
          professional_id: string
          student_id: string
          status: LinkStatus
          since: string
        }
        Insert: never
        Update: { status?: LinkStatus }
        Relationships: [
          {
            foreignKeyName: 'coach_students_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'coach_students_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      invites: {
        Row: {
          id: string
          organization_id: string
          invited_by: string
          role: MemberRole
          name: string | null
          code: string
          expires_at: string
          accepted_by: string | null
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          organization_id: string
          invited_by: string
          role: MemberRole
          name?: string | null
        }
        Update: never
        Relationships: []
      }
      workout_logs: {
        Row: {
          id: string
          student_id: string
          organization_id: string
          day_index: number
          day_name: string
          exercises: Json
          started_at: string
          finished_at: string | null
        }
        Insert: {
          student_id: string
          organization_id: string
          day_index: number
          day_name: string
          exercises?: Json
          started_at?: string
        }
        Update: {
          exercises?: Json
          finished_at?: string | null
        }
        Relationships: []
      }
      plans: {
        Row: {
          student_id: string
          kind: PlanKindDb
          organization_id: string
          draft: Json | null
          draft_by_agent: boolean
          draft_updated_at: string | null
          draft_updated_by: string | null
          published: Json | null
          published_at: string | null
          published_by: string | null
          created_at: string
        }
        Insert: {
          student_id: string
          kind: PlanKindDb
          organization_id: string
          draft?: Json | null
          draft_by_agent?: boolean
          draft_updated_at?: string | null
          draft_updated_by?: string | null
        }
        Update: {
          draft?: Json | null
          draft_by_agent?: boolean
          draft_updated_at?: string | null
          draft_updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'plans_draft_updated_by_fkey'
            columns: ['draft_updated_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'plans_published_by_fkey'
            columns: ['published_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      anamneses: {
        Row: AnamneseAnswers & {
          student_id: string
          organization_id: string
          step: number
          submitted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<AnamneseAnswers> & {
          student_id: string
          organization_id: string
          step?: number
        }
        Update: Partial<AnamneseAnswers> & {
          step?: number
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'anamneses_student_id_fkey'
            columns: ['student_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      create_organization: {
        Args: { org_name: string; cref?: string | null }
        Returns: string
      }
      get_invite: {
        Args: { invite_code: string }
        Returns: {
          organization_name: string
          role: MemberRole
          invited_by_name: string
          name: string | null
          valid: boolean
        }[]
      }
      accept_invite: {
        Args: { invite_code: string; registry?: string | null }
        Returns: string
      }
      link_student: {
        Args: { org: string; professional: string; student: string }
        Returns: undefined
      }
      can_manage_plan: {
        Args: { org: string; student: string; k: PlanKindDb }
        Returns: boolean
      }
      approve_plan: {
        Args: { student: string; k: PlanKindDb }
        Returns: string
      }
      my_plans: {
        Args: Record<string, never>
        Returns: { kind: PlanKindDb; content: Json; published_at: string; published_by_name: string | null }[]
      }
      is_platform_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      admin_overview: {
        Args: Record<string, never>
        Returns: AdminOverview
      }
    }
    Enums: {
      member_role: MemberRole
      link_status: LinkStatus
      plan_kind: PlanKindDb
    }
    CompositeTypes: { [_ in never]: never }
  }
}
