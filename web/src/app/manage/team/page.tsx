import { Badge, Card, ColorDot, employeeColor, Field, inputClass, SectionTitle } from "@/components/ui";
import { withManager } from "@/lib/server/session";
import { listEmployees, type Employee } from "@/lib/server/team";
import { addEmployeeAction, setActiveAction, setPinAction, updateEmployeeAction } from "../actions";
import { ActionForm, SubmitButton } from "../forms";

export default async function TeamPage() {
  return withManager(async (db) => {
    const everyone = await listEmployees(db, { includeInactive: true });
    const active = everyone.filter((e) => e.active);
    const former = everyone.filter((e) => !e.active);

    return (
      <div className="max-w-3xl">
        <h1 className="font-serif text-3xl font-semibold">Team</h1>
        <p className="text-sm text-ink/60">
          Everyone clocks in on the store iPad with their own 4-digit PIN. Add an email if they should see the schedule on
          their phone.
        </p>

        <SectionTitle>Add an employee</SectionTitle>
        <Card>
          <ActionForm action={addEmployeeAction} resetOnSuccess className="flex flex-wrap items-end gap-3">
            <div className="min-w-40 flex-1">
              <Field label="Name">
                <input name="displayName" required maxLength={60} className={inputClass} autoComplete="off" />
              </Field>
            </div>
            <div className="min-w-52 flex-1">
              <Field label="Email (optional)">
                <input name="email" type="email" className={inputClass} autoComplete="off" />
              </Field>
            </div>
            <SubmitButton>Add and create PIN</SubmitButton>
          </ActionForm>
        </Card>

        <SectionTitle>Active ({active.length})</SectionTitle>
        <div className="space-y-2">
          {active.map((employee) => (
            <EmployeeCard key={employee.id} employee={employee} />
          ))}
        </div>

        {former.length > 0 && (
          <>
            <SectionTitle>Former employees</SectionTitle>
            <Card className="divide-y divide-ink/5 p-0">
              {former.map((employee) => (
                <div key={employee.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="text-ink/70">{employee.displayName}</span>
                  <ActionForm action={setActiveAction}>
                    <input type="hidden" name="id" value={employee.id} />
                    <input type="hidden" name="active" value="true" />
                    <SubmitButton variant="quiet">Reactivate</SubmitButton>
                  </ActionForm>
                </div>
              ))}
            </Card>
          </>
        )}
      </div>
    );
  });
}

function EmployeeCard({ employee }: { employee: Employee }) {
  return (
    <Card className="p-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm">
          <span className="flex items-center gap-2 font-medium">
            <ColorDot color={employeeColor(employee.colorIndex)} />
            {employee.displayName}
            {employee.role === "manager" && <Badge tone="porcelain">Manager</Badge>}
          </span>
          <span className="flex items-center gap-2 text-ink/60">
            {employee.email ? <span className="hidden sm:inline">{employee.email}</span> : <span className="text-xs">No phone sign-in</span>}
            {employee.hasPin ? <Badge tone="sage">PIN set</Badge> : <Badge tone="red">No PIN</Badge>}
            <span className="text-porcelain group-open:hidden">Edit</span>
          </span>
        </summary>
        <div className="space-y-4 border-t border-ink/5 px-4 py-4">
          <ActionForm action={updateEmployeeAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={employee.id} />
            <div className="min-w-40 flex-1">
              <Field label="Name">
                <input name="displayName" defaultValue={employee.displayName} required maxLength={60} className={inputClass} />
              </Field>
            </div>
            <div className="min-w-52 flex-1">
              <Field label="Email for phone sign-in">
                <input
                  name="email"
                  type="email"
                  defaultValue={employee.email ?? ""}
                  readOnly={employee.role === "manager"}
                  className={inputClass}
                />
              </Field>
            </div>
            <SubmitButton variant="secondary">Save</SubmitButton>
          </ActionForm>

          <ActionForm action={setPinAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={employee.id} />
            <div className="w-32">
              <Field label="PIN">
                <input
                  name="pin"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  placeholder="4 digits"
                  autoComplete="off"
                  className={`${inputClass} font-mono tracking-widest`}
                />
              </Field>
            </div>
            <SubmitButton variant="secondary" name="mode" value="set">
              Set this PIN
            </SubmitButton>
            <SubmitButton variant="secondary" name="mode" value="random">
              Make a new random PIN
            </SubmitButton>
            {employee.hasPin && (
              <SubmitButton variant="quiet" name="mode" value="clear">
                Remove PIN
              </SubmitButton>
            )}
          </ActionForm>

          {employee.role !== "manager" && (
            <ActionForm
              action={setActiveAction}
              confirm={`Deactivate ${employee.displayName}? Their PIN and phone sign-in stop working. Their hours stay on past timesheets.`}
            >
              <input type="hidden" name="id" value={employee.id} />
              <input type="hidden" name="active" value="false" />
              <SubmitButton variant="danger">Deactivate</SubmitButton>
            </ActionForm>
          )}
        </div>
      </details>
    </Card>
  );
}
