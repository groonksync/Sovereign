-- TABLA DE PROYECTOS NEXUS
CREATE TABLE IF NOT EXISTS nexus_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    drive_url TEXT,
    meeting_url TEXT,
    status TEXT DEFAULT 'briefing' CHECK (status IN ('briefing', 'production', 'feedback', 'finished')),
    branding_json JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLA DE ENTREGABLES (DELIVERABLES)
CREATE TABLE IF NOT EXISTS nexus_deliverables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES nexus_projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    price NUMERIC(12, 2) DEFAULT 0.00,
    currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD', 'BOB', 'EUR')),
    version INTEGER DEFAULT 1,
    status TEXT DEFAULT 'pending' CHECK (status IN ('paid', 'pending')),
    notes_html TEXT,
    creative_assets_json JSONB DEFAULT '[]', -- Para Audio/Stock
    metadata_json JSONB DEFAULT '{}', -- Para type, payment_method, dates, refs
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- VISTA PARA STUDIO CLOUD (JOIN QUERY)
CREATE OR REPLACE VIEW nexus_cloud_view AS
SELECT 
    p.name as project_name,
    p.drive_url,
    p.created_at,
    p.status as project_status
FROM nexus_projects p
WHERE p.drive_url IS NOT NULL AND p.drive_url != '';
