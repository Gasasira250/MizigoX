import { documentTypeLabel, fleetStatusLabel, type FleetDocumentPayload } from '@mizigox/shared';
import { useState, type FormEvent } from 'react';
import { apiDelete, apiPatch, apiPost } from '../../shared/api/client';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { useToast } from '../../shared/ui/ToastProvider';
import { DocumentAlertBadge } from './DocumentAlertBadge';
import {
  buildDocumentPayload,
  documentFromPayload,
  documentStatusOptions,
  emptyDocumentForm,
  formatApiError,
  formatDate,
  validateDocumentForm,
  type DocumentFormState,
} from './form-utils';

export function DocumentsPanel({
  ownerLabel,
  documents,
  createPath,
  itemPath,
  typeOptions,
  canCreate,
  canUpdate,
  canDelete,
  onChanged,
}: {
  ownerLabel: string;
  documents: FleetDocumentPayload[];
  createPath: string;
  itemPath: (documentId: string) => string;
  typeOptions: Array<{ value: string; label: string }>;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onChanged: () => Promise<void>;
}) {
  const { notify } = useToast();
  const [form, setForm] = useState<DocumentFormState>(
    emptyDocumentForm(typeOptions[0]?.value ?? 'OTHER'),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);

  function update<K extends keyof DocumentFormState>(key: K, value: DocumentFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startEdit(document: FleetDocumentPayload) {
    setEditingId(document.id);
    setForm(documentFromPayload(document));
    setError(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyDocumentForm(typeOptions[0]?.value ?? 'OTHER'));
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const messages = validateDocumentForm(form);
    if (messages.length > 0) {
      setError(messages[0] ?? 'Check the document fields.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await apiPatch(itemPath(editingId), buildDocumentPayload(form));
        notify(`${ownerLabel} document was updated.`);
      } else {
        await apiPost(createPath, buildDocumentPayload(form));
        notify(`${ownerLabel} document was added.`);
      }
      resetForm();
      await onChanged();
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to save document'));
    } finally {
      setBusy(false);
    }
  }

  async function removeDocument() {
    if (!removeId) {
      return;
    }
    setBusy(true);
    try {
      await apiDelete(itemPath(removeId));
      notify(`${ownerLabel} document was removed.`);
      if (editingId === removeId) {
        resetForm();
      }
      await onChanged();
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to remove document'), 'error');
    } finally {
      setBusy(false);
      setRemoveId(null);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-sm font-semibold text-[#12355b]">Documents</h2>
        <p className="mt-1 text-sm text-slate-600">
          Store document metadata and an object-storage key or URL. Binary files are not kept in
          PostgreSQL.
        </p>
      </div>

      {documents.length === 0 ? (
        <p className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-500">
          No documents recorded yet. Add a registration, insurance, license, or other compliance
          record.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Number</th>
                <th className="py-2 pr-4 font-medium">Expiry</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Storage</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id} className="border-t border-slate-100">
                  <td className="py-2 pr-4">{documentTypeLabel(document.documentType)}</td>
                  <td className="py-2 pr-4">{document.documentNumber ?? '—'}</td>
                  <td className="py-2 pr-4">
                    <div>{formatDate(document.expiresAt)}</div>
                    <DocumentAlertBadge alert={document.alert} />
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={document.status} />
                  </td>
                  <td className="py-2 pr-4 text-slate-600">
                    {document.fileUrl ? (
                      <a className="text-teal-800 hover:underline" href={document.fileUrl}>
                        Open reference
                      </a>
                    ) : (
                      document.storageKey || fleetStatusLabel(document.storageProvider)
                    )}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      {canUpdate ? (
                        <button
                          type="button"
                          className="text-teal-800 hover:underline"
                          onClick={() => startEdit(document)}
                        >
                          Edit
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          className="text-red-700 hover:underline"
                          onClick={() => setRemoveId(document.id)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canCreate || (canUpdate && editingId) ? (
        <form
          className="grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-2"
          onSubmit={(event) => {
            void onSubmit(event);
          }}
        >
          <h3 className="text-sm font-medium text-[#12355b] md:col-span-2">
            {editingId ? 'Update document' : 'Add document'}
          </h3>
          <label className="text-sm font-medium">
            Document type
            <select
              className={inputClass}
              value={form.documentType}
              onChange={(event) => update('documentType', event.target.value)}
            >
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Document number
            <input
              className={inputClass}
              value={form.documentNumber}
              onChange={(event) => update('documentNumber', event.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            Issue date
            <input
              className={inputClass}
              type="date"
              value={form.issuedAt}
              onChange={(event) => update('issuedAt', event.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            Expiry date
            <input
              className={inputClass}
              type="date"
              value={form.expiresAt}
              onChange={(event) => update('expiresAt', event.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            Status
            <select
              className={inputClass}
              value={form.status}
              onChange={(event) =>
                update('status', event.target.value as DocumentFormState['status'])
              }
            >
              {documentStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Storage key
            <input
              className={inputClass}
              value={form.storageKey}
              onChange={(event) => update('storageKey', event.target.value)}
              placeholder="future-object-key"
            />
          </label>
          <label className="text-sm font-medium md:col-span-2">
            File URL
            <input
              className={inputClass}
              value={form.fileUrl}
              onChange={(event) => update('fileUrl', event.target.value)}
              placeholder="https://storage.example/documents/…"
            />
          </label>
          <label className="text-sm font-medium md:col-span-2">
            Notes
            <textarea
              className={inputClass}
              rows={2}
              value={form.notes}
              onChange={(event) => update('notes', event.target.value)}
            />
          </label>
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2 md:col-span-2">
            <button
              className="rounded-md bg-[#12355b] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={busy}
              type="submit"
            >
              {busy ? 'Saving…' : editingId ? 'Save document' : 'Add document'}
            </button>
            {editingId ? (
              <button
                className="rounded-md border px-3 py-2 text-sm"
                type="button"
                onClick={resetForm}
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {removeId ? (
        <ConfirmDialog
          title="Remove document?"
          message="The document record will be archived. The object-storage reference is kept for a later cleanup job."
          confirmLabel="Remove"
          danger
          onCancel={() => (busy ? undefined : setRemoveId(null))}
          onConfirm={() => {
            if (!busy) {
              void removeDocument();
            }
          }}
        />
      ) : null}
    </section>
  );
}

const inputClass = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm';
