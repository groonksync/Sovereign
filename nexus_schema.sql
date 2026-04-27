-- ACTUALIZACIÓN DE ESQUEMA: SOVEREIGN NEXUS ELITE
-- Ejecutar en el SQL Editor de Supabase

-- 1. Tabla de Proyectos (Nexus)
CREATE TABLE IF NOT EXISTS nexus_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    drive_url TEXT,
    meeting_url TEXT,
    status TEXT DEFAULT 'briefing',
    branding_json JSONB DEFAULT '{}', -- Para el Branding Vault
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabla de Entregables (Deliverables)
CREATE TABLE IF NOT EXISTS nexus_deliverables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES nexus_projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    price NUMERIC DEFAULT 0.00,
    currency TEXT DEFAULT 'USD',
    version INTEGER DEFAULT 1,
    status TEXT DEFAULT 'pending', -- 'paid' o 'pending'
    notes_html TEXT, -- Para el Intelligent Editor
    assets_json JSONB DEFAULT '[]', -- Para el control de archivos
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Desactivar RLS para acceso directo desde la App Personal
ALTER TABLE nexus_projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_deliverables DISABLE ROW LEVEL SECURITY;
