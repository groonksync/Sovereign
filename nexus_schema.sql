-- ACTUALIZACIÓN DE ESQUEMA: SOVEREIGN NEXUS ELITE V3 (DNA DEFINITIVO)
-- Ejecutar en el SQL Editor de Supabase para habilitar las nuevas funciones de Operación.

-- 1. Tabla de Proyectos (Nexus)
CREATE TABLE IF NOT EXISTS nexus_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    drive_url TEXT,
    meeting_url TEXT,
    status TEXT DEFAULT 'briefing',
    branding_json JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabla de Entregables (Deliverables)
CREATE TABLE IF NOT EXISTS nexus_deliverables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES nexus_projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT DEFAULT 'video',
    quantity INTEGER DEFAULT 1,
    price NUMERIC DEFAULT 0.00,
    currency TEXT DEFAULT 'USD',
    method TEXT DEFAULT '',
    link_empresa TEXT DEFAULT '',
    link_general TEXT DEFAULT '',
    status_paid TEXT DEFAULT 'pending',
    notes_html TEXT,
    feedback_color TEXT DEFAULT 'green',
    version INTEGER DEFAULT 1,
    assets_json JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Desactivar RLS para acceso directo desde la App Personal
ALTER TABLE nexus_projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_deliverables DISABLE ROW LEVEL SECURITY;
