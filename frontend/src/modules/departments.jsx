// Public-facing department pages. Shows which identity fields each department
// receives from Home Affairs, what services it offers, and which other
// departments share its ministry.

import { Link, useParams, useNavigate } from 'react-router-dom';
import { useApp, Card, Page, Icon, Loading, FIELD_LABELS } from '../core.jsx';

// Ministry groupings from the HCI report section 2.1
const MINISTRY = {
  HOME_AFFAIRS: { code: 'MHA', name: 'Ministry of Home Affairs' },
  PASSPORT:     { code: 'MHA', name: 'Ministry of Home Affairs' },
  TRAFFIC:      { code: 'MPWT', name: 'Ministry of Public Works and Transport' },
  FINANCE:      { code: 'MFDP', name: 'Ministry of Finance and Development Planning' },
  PENSION:      { code: 'MFDP', name: 'Ministry of Finance and Development Planning' },
  POLICE:       { code: 'MPOL', name: 'Ministry of Police' },
};

// Identity fields each department may receive from Home Affairs.
// Mirrors the DepartmentFieldScope rows created by the seed.
const SCOPE = {
  HOME_AFFAIRS: ['fullName', 'dateOfBirth', 'citizenship', 'address', 'phone'],
  TRAFFIC:      ['fullName', 'dateOfBirth', 'citizenship', 'address'],
  FINANCE:      ['fullName', 'citizenship'],
  PENSION:      ['fullName', 'dateOfBirth', 'citizenship'],
  POLICE:       ['fullName', 'citizenship'],
  PASSPORT:     ['fullName', 'dateOfBirth', 'citizenship', 'address'],
};

// Descriptions adapted from the HCI report section 2.1
const DESCRIPTION = {
  HOME_AFFAIRS: 'Civil registration, identity management, and the authoritative source of citizen identity for every other department in the platform.',
  TRAFFIC:      'Driver licensing, motor vehicle registration, public transport permits, roadworthiness checks, and traffic fines.',
  FINANCE:      'Tax, payment records, grant eligibility, and subsidy applications. Works together with Pension Services under the same ministry.',
  PENSION:      'Pension eligibility, applications, and pension-related payments. Operates under the Ministry of Finance and Development Planning alongside Finance.',
  POLICE:       'Police clearance certificates and authorised identity checks for investigations. Sensitive police records remain within police systems.',
  PASSPORT:     'Passport issuance, renewal, replacement, and citizenship verification. Uses verified identity from Home Affairs.',
};

// Order shown on the list page
const ORDER = ['HOME_AFFAIRS', 'PASSPORT', 'TRAFFIC', 'FINANCE', 'PENSION', 'POLICE'];

export function Departments() {
  const { departments, services, catalogReady, deptName } = useApp();

  if (!catalogReady) {
    return <Page title="Connected departments"><Loading /></Page>;
  }

  // Group departments by ministry for the list view
  const byMinistry = {};
  for (const code of ORDER) {
    const m = MINISTRY[code];
    if (!m) continue;
    if (!byMinistry[m.code]) byMinistry[m.code] = { name: m.name, depts: [] };
    byMinistry[m.code].depts.push(code);
  }

  return (
    <Page
      title="Connected departments"
      sub="Home Affairs is the authoritative source of identity. Every other department receives only the fields it needs, and every release is logged."
    >
      <p className="callout ok">
        <Icon name="shield-check" size={20} />
        <div>
          <b>One verified identity, shared under control.</b>
          <small>
            When you apply for a service, Home Affairs releases only the fields that department
            is authorised to receive. Every release is recorded in the audit log.
          </small>
        </div>
      </p>

      {Object.entries(byMinistry).map(([mCode, m]) => (
        <Card key={mCode} title={m.name}>
          <div className="grid3">
            {m.depts.map((code) => {
              const d = departments.find((x) => x.code === code);
              if (!d) return null;
              const offered = services.filter((s) => s.dept === code);
              const scope = SCOPE[code] ?? [];
              const isHA = code === 'HOME_AFFAIRS';
              return (
                <Card key={code} title={d.name}>
                  {isHA && (
                    <p className="badge green">
                      <Icon name="shield-check" size={13} /> Identity source
                    </p>
                  )}
                  <p className="muted" style={{ marginTop: isHA ? 10 : 0, marginBottom: 6 }}>
                    <small>Receives from Home Affairs</small>
                  </p>
                  <ul style={{ margin: '0 0 12px', paddingLeft: 18 }}>
                    {isHA
                      ? <li className="muted">All identity fields, as the source</li>
                      : scope.map((f) => <li key={f}>{FIELD_LABELS[f] ?? f}</li>)}
                  </ul>
                  <p className="muted" style={{ marginBottom: 6 }}>
                    <small>Services offered ({offered.length})</small>
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {offered.length
                      ? offered.map((s) => <li key={s.code}>{s.name}</li>)
                      : <li className="muted">No services online yet</li>}
                  </ul>
                  <Link className="btn block" to={`/app/departments/${code}`} style={{ marginTop: 12 }}>
                    View department <Icon name="arrow-right" size={14} />
                  </Link>
                </Card>
              );
            })}
          </div>
        </Card>
      ))}
    </Page>
  );
}

export function DepartmentDetail() {
  const { code } = useParams();
  const { departments, services, svcByCode, catalogReady } = useApp();
  const nav = useNavigate();

  if (!catalogReady) return <Page title="Department"><Loading /></Page>;

  const dept = departments.find((d) => d.code === code);
  if (!dept) {
    return (
      <Page title="Department not found" sub={`No department with code ${code}.`}>
        <p><Link to="/app/departments">Back to all departments</Link></p>
      </Page>
    );
  }

  const ministry = MINISTRY[code];
  const scope = SCOPE[code] ?? [];
  const offered = services.filter((s) => s.dept === code);
  const isHA = code === 'HOME_AFFAIRS';

  // Departments in the same ministry, excluding this one
  const related = ORDER.filter((c) => c !== code && MINISTRY[c]?.code === ministry?.code);

  return (
    <Page title={dept.name} sub={ministry?.name}>
      <button className="btn ghost" type="button" onClick={() => nav('/app/departments')}>
        <Icon name="arrow-left" size={14} /> All departments
      </button>

      <Card title="About this department">
        <p>{DESCRIPTION[code] ?? 'A connected government service.'}</p>
      </Card>

      <div className="grid2">
        <Card title="What Home Affairs releases">
          {isHA
            ? <p className="callout ok">
                <Icon name="shield-check" size={18} />
                This department is the source of identity. It holds every field the platform uses.
              </p>
            : <>
                <p className="muted">
                  <small>
                    Only these fields of your identity are ever shared with {dept.name}. The rest stay with
                    Home Affairs.
                  </small>
                </p>
                <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                  {scope.map((f) => <li key={f}>{FIELD_LABELS[f] ?? f}</li>)}
                </ul>
              </>}
        </Card>

        <Card title="Services offered">
          {offered.length ? (
            <div className="grid2">
              {offered.map((s) => (
                <div key={s.code} style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <b>{s.name}</b>
                  <small className="muted">
                    {s.fee ? `Fee: M ${Number(s.fee).toFixed(2)}` : 'Free'}
                    {s.days ? ` · About ${s.days} working days` : ''}
                  </small>
                  <Link className="btn sm" to={`/app/apply/${s.code}`} style={{ marginTop: 8 }}>
                    Apply <Icon name="arrow-right" size={12} />
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No services offered online yet.</p>
          )}
        </Card>
      </div>

      {related.length > 0 && (
        <Card title="Related departments">
          <p className="muted">
            <small>Also in the {ministry?.name}:</small>
          </p>
          <div className="grid3">
            {related.map((rCode) => {
              const r = departments.find((d) => d.code === rCode);
              if (!r) return null;
              const rScope = SCOPE[rCode] ?? [];
              return (
                <Card key={rCode} title={r.name}>
                  <p className="muted" style={{ marginBottom: 8 }}><small>{DESCRIPTION[rCode]}</small></p>
                  <p className="muted" style={{ marginBottom: 6 }}>
                    <small>Identity scope</small>
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {rCode === 'HOME_AFFAIRS'
                      ? <li className="muted">Source of identity</li>
                      : rScope.map((f) => <li key={f}>{FIELD_LABELS[f] ?? f}</li>)}
                  </ul>
                  <Link className="btn block" to={`/app/departments/${rCode}`} style={{ marginTop: 12 }}>
                    View <Icon name="arrow-right" size={14} />
                  </Link>
                </Card>
              );
            })}
          </div>
        </Card>
      )}
    </Page>
  );
}