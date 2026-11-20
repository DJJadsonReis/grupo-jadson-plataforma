import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ConnectionSharesService } from "./connection-shares.service";

const owner = { id: "11111111-1111-4111-8111-111111111111", name: "Ana", role: "operator" as const };
const grantee = "22222222-2222-4222-8222-222222222222";
function setup() {
  const query = jest.fn();
  const db = { getPool: () => ({ query }) };
  const google = { status: jest.fn().mockResolvedValue({ connected: true }) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return { service: new ConnectionSharesService(db as never, google as never, audit as never), query, google, audit };
}
describe("ConnectionSharesService", () => {
  it("rejects invalid/self target before querying", async () => {
    const { service, query } = setup();
    await expect(service.request("bad", owner)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.request(owner.id, owner)).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });
  it("requires an active Google connection and inserts a pending request", async () => {
    const { service, query, google, audit } = setup();
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{}] }).mockResolvedValueOnce({ rowCount: 0, rows: [] }).mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "pending" }] });
    await expect(service.request(grantee, owner)).resolves.toEqual({ status: "pending" });
    expect(google.status).toHaveBeenCalledWith(owner.id);
    expect(query.mock.calls[2][0]).toContain("INSERT");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "connection.share.request", details: { granteeId: grantee } }));
  });
  it("does not insert without Google and blocks unresolved access", async () => {
    const { service, query, google } = setup();
    google.status.mockResolvedValue({ connected: false });
    query.mockResolvedValue({ rowCount: 1, rows: [{}] });
    await expect(service.request(grantee, owner)).rejects.toMatchObject({ response: { code: "NO_CONNECTION" } });
    expect(query).toHaveBeenCalledTimes(1);
    query.mockResolvedValue({ rowCount: 0, rows: [] });
    await expect(service.resolveOwner(grantee, owner.id)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("resolves approved active owner and reports missing shares", async () => {
    const { service, query } = setup();
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{}] });
    await expect(service.resolveOwner(grantee, owner.id)).resolves.toBe(owner.id);
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(service.resolveOwner(grantee, owner.id)).rejects.toMatchObject({ response: { code: "CONEXAO_NAO_LIBERADA" } });
  });
  it("returns existing request without inserting duplicate", async () => {
    const { service, query, audit } = setup();
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{}] }).mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "approved" }] });
    await expect(service.request(grantee, owner)).resolves.toEqual({ status: "approved" });
    expect(query).toHaveBeenCalledTimes(2);
    expect(audit.record).not.toHaveBeenCalled();
  });
  it("returns only person names, IDs, statuses and timestamps", async () => {
    const { service, query } = setup();
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: grantee, name: "Bruno", status: "pending", requestedAt: new Date(0), approvedAt: null }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: owner.id, name: "Ana", status: "approved", requestedAt: new Date(0), approvedAt: new Date(1) }] });
    const response = await service.list(owner);
    expect(response.outgoing[0]).toMatchObject({ id: grantee, name: "Bruno", status: "pending" });
    expect(response.incoming[0]).toMatchObject({ id: owner.id, name: "Ana", status: "approved" });
    expect(JSON.stringify(response)).not.toMatch(/refresh_token|access_token|secret|email|token/i);
    expect(query.mock.calls.every(([sql]) => !/refresh_token|access_token|secret|email|token/i.test(String(sql)))).toBe(true);
  });
  it("reports a missing approval", async () => {
    const { service, query } = setup(); query.mockResolvedValue({ rowCount: 0, rows: [] });
    await expect(service.approve(owner.id, grantee, { ...owner, role: "admin" })).rejects.toBeInstanceOf(NotFoundException);
  });
  it("rejects inactive targets and owners without Google before writing", async () => {
    const { service, query, google } = setup();
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(service.request(grantee, owner)).rejects.toBeInstanceOf(BadRequestException);
    expect(google.status).not.toHaveBeenCalled();
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{}] });
    google.status.mockResolvedValue({ connected: false });
    await expect(service.request(grantee, owner)).rejects.toMatchObject({ response: { code: "NO_CONNECTION" } });
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("revokes only for owner or admin and audits the removal", async () => {
    const { service, query, audit } = setup();
    const third = { ...owner, id: "33333333-3333-4333-8333-333333333333" };
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] }).mockResolvedValueOnce({ rowCount: 1, rows: [{}] });
    await expect(service.revoke(grantee, third)).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.every(([sql]) => String(sql).startsWith("SELECT"))).toBe(true);
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ ownerId: owner.id }] }).mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await expect(service.revoke(grantee, owner)).resolves.toEqual({ revoked: true });
    expect(query.mock.calls[3][0]).toContain("DELETE");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "connection.share.revoke", subject: owner.id, details: { granteeId: grantee } }));
  });
  it("lets an admin revoke a selected owner's share and returns 404 when absent", async () => {
    const { service, query } = setup();
    const admin = { ...owner, role: "admin" as const };
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(service.revoke(grantee, admin)).rejects.toBeInstanceOf(NotFoundException);
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ ownerId: owner.id }] }).mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await expect(service.revoke(grantee, admin, owner.id)).resolves.toEqual({ revoked: true });
  });
  it("approves pending shares and leaves an already approved row untouched", async () => {
    const { service, query, audit } = setup();
    const admin = { ...owner, role: "admin" as const };
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "pending" }] }).mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "approved", approvedBy: admin.id }] });
    await expect(service.approve(owner.id, grantee, admin)).resolves.toMatchObject({ status: "approved", approvedBy: admin.id });
    expect(query.mock.calls[1][0]).toContain("UPDATE");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "connection.share.approve", subject: owner.id, details: { granteeId: grantee } }));
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "approved", approvedAt: new Date(0) }] });
    const calls = query.mock.calls.length;
    await expect(service.approve(owner.id, grantee, admin)).resolves.toMatchObject({ status: "approved" });
    expect(query).toHaveBeenCalledTimes(calls + 1);
  });
});
