-- Esquema para el Módulo Editor Pro (Workspace Multidisciplinario)

-- 1. Tabla de Clientes (Si no existe)
CREATE TABLE IF NOT EXISTS editor_clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    country TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabla de Proyectos
CREATE TABLE IF NOT EXISTS editor_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES editor_clients(id),
    title TEXT NOT NULL,
    service_type TEXT NOT NULL, -- 'Video', 'Web', 'App', 'Flyer'
    status TEXT DEFAULT 'Briefing',
    total_budget_usd DECIMAL(12, 2),
    payment_method TEXT, -- 'PayPal', 'Zelle', 'Bank Transfer'
    billing_type TEXT, -- 'One-time', 'Subscription'
    briefing_notes TEXT,
    next_meeting TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Requerimientos (Hijos de Proyecto)
CREATE TABLE IF NOT EXISTS project_requirements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES editor_projects(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    is_mandatory BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Entregables (Hijos de Proyecto)
CREATE TABLE IF NOT EXISTS project_deliverables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES editor_projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    objective TEXT,
    technical_specs TEXT,
    status TEXT DEFAULT 'Pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Referencias de Estilo
CREATE TABLE IF NOT EXISTS project_references (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES editor_projects(id) ON DELETE CASCADE,
    ref_url TEXT,
    creator_name TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
