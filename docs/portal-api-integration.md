# Support Portal API integration guide

This guide explains how another portal can display the support form linked to an API key, submit requests, show the resulting tickets, and allow requester comments.

## Integration model

One portal API key is linked to one support form. The external portal does not select a department or a support form.

The workflow is:

1. Your server requests the form definition.
2. Your frontend renders the returned default fields, issues, and custom fields.
3. The requester selects an issue and completes the form.
4. Your server submits the request using the API key.
5. The API returns the submission ID and created ticket ID.
6. Your portal can show the submission and ticket and can add requester comments to that ticket.

The selected issue determines the internal department, sub-department, and SLA policy. Do not ask the requester to select a department.

## Before starting

Ask the tenant administrator for:

- The API base URL shown on the **Generate API** page.
- The portal API key. It starts with `pen_` and is displayed only once.

Store both values as secrets on your server:

```env
SUPPORT_API_BASE_URL=https://support.example.com/api/portal/v1
SUPPORT_API_KEY=pen_REPLACE_WITH_THE_REAL_KEY
```

Never include the API key in frontend JavaScript, HTML, local storage, mobile application source code, URLs, analytics, or logs. Browser and mobile clients should call your own authenticated backend, and your backend should call this API.

## Authentication and common headers

Every request requires Bearer authentication:

```http
Authorization: Bearer pen_REPLACE_WITH_THE_REAL_KEY
Accept: application/json
```

Requests with a JSON body also require:

```http
Content-Type: application/json
```

The maximum JSON request body is 1 MB.

## Endpoints

| Purpose | Method and route |
| --- | --- |
| Check the integration | `GET /api/portal/v1` |
| Get the linked form | `GET /api/portal/v1/form` |
| Submit the form | `POST /api/portal/v1/form/submissions` |
| List a requester's submissions | `GET /api/portal/v1/submissions?email={email}` |
| Get one submission | `GET /api/portal/v1/submissions/{submissionId}` |
| Get its ticket and comments | `GET /api/portal/v1/tickets/{ticketId}` |
| Add a requester comment | `POST /api/portal/v1/tickets/{ticketId}/comments` |

All submission and ticket endpoints are restricted to records created through the same API key.

## 1. Check the integration

```bash
curl "$SUPPORT_API_BASE_URL" \
  -H "Authorization: Bearer $SUPPORT_API_KEY" \
  -H "Accept: application/json"
```

Example response:

```json
{
  "name": "Support Portal API",
  "version": "v1",
  "tenantId": "cmul13zan000scijx9po9f6tv",
  "tenantName": "Example Tenant",
  "endpoints": {
    "form": "GET /api/portal/v1/form",
    "submit": "POST /api/portal/v1/form/submissions",
    "submissions": "GET /api/portal/v1/submissions?email={email}",
    "submission": "GET /api/portal/v1/submissions/{submissionId}",
    "ticket": "GET /api/portal/v1/tickets/{ticketId}",
    "comment": "POST /api/portal/v1/tickets/{ticketId}/comments"
  }
}
```

## 2. Get and render the form

```bash
curl "$SUPPORT_API_BASE_URL/form" \
  -H "Authorization: Bearer $SUPPORT_API_KEY" \
  -H "Accept: application/json"
```

Example response:

```json
{
  "data": {
    "id": "2bf8df47-65f3-4f95-a6ac-bfbde9cb7301",
    "name": "Customer support",
    "schemaVersion": 3,
    "defaultFields": {
      "submitterName": {
        "label": "Your name",
        "placeholder": "Full name"
      },
      "submitterEmail": {
        "label": "Email address",
        "placeholder": "you@example.com"
      },
      "title": {
        "label": "Title",
        "placeholder": "Brief summary of your request"
      },
      "issueType": {
        "label": "Issue type",
        "placeholder": "Select an issue type"
      }
    },
    "issues": [
      {
        "id": "cmissue123",
        "name": "Cannot log in"
      }
    ],
    "fields": [
      {
        "id": "cmfield123",
        "label": "What happened?",
        "type": "richtext",
        "isRequired": true,
        "order": 0,
        "options": [],
        "childOptions": {},
        "placeholder": "Describe the problem",
        "helperText": null,
        "validation": null,
        "visibleWhen": null
      }
    ]
  }
}
```

Render the four `defaultFields` separately. Render `issues` as a required selector whose submitted value is the issue `id`. Render `fields` in ascending `order` and use each field's `id` when submitting its value.

Supported custom field types are:

- `text` and `richtext`: string input.
- `email`: email string.
- `number`: numeric value encoded as a string.
- `date`: `YYYY-MM-DD`.
- `select` and `radio`: one value from `options`.
- `checkbox`: selected option values joined with commas. A checkbox without options uses `"true"` when checked.
- Nested select: `Parent option > Child option`, using the values in `childOptions`.
- `file`: the API accepts a string value but does not provide a public upload endpoint. Agree on a secure file-reference format before enabling file fields in an external portal.

Follow `validation` and `visibleWhen` when rendering the form. The API repeats these checks server-side and returns field-specific errors if the submitted values are invalid.

Do not hard-code fields or issue IDs. Fetch the form again when the page loads or use a short cache, because the tenant administrator can change the form.

## 3. Submit the form

```bash
curl "$SUPPORT_API_BASE_URL/form/submissions" \
  -X POST \
  -H "Authorization: Bearer $SUPPORT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Idempotency-Key: request-8d61b763-49f0-4471-963d-1fbaf031589b" \
  --data '{
    "submitterName": "Amira Khan",
    "submitterEmail": "amira@example.com",
    "title": "Unable to access my account",
    "issueId": "cmissue123",
    "responses": [
      {
        "fieldId": "cmfield123",
        "value": "The login page returns an invalid session message."
      }
    ]
  }'
```

Required properties:

- `submitterName`
- `submitterEmail`, using a valid email address
- `issueId`, taken from the current form response
- `responses`, an array containing the custom field values

`title` is supported and should normally be collected even though the service can generate a fallback title.

Every response value must be a string. Omit fields that are currently hidden by `visibleWhen`. Required visible fields must have a value.

Use a unique, stable `Idempotency-Key` for each logical submission. If your request times out, retry with the same key. This prevents a network retry from creating a second ticket.

Successful response:

```json
{
  "data": {
    "submissionId": "cmsubmission123",
    "ticketId": "cmticket123",
    "ticketReference": "IT-184"
  }
}
```

An idempotent retry returns the original identifiers and includes:

```json
{
  "data": {
    "submissionId": "cmsubmission123",
    "ticketId": "cmticket123"
  },
  "duplicate": true
}
```

Save `submissionId` and `ticketId` against the authenticated user in your portal.

## 4. Show the requester's submissions

Use the authenticated portal user's email. Do not accept an arbitrary email query from the browser without verifying that it belongs to the signed-in user.

```bash
curl "$SUPPORT_API_BASE_URL/submissions?email=amira%40example.com" \
  -H "Authorization: Bearer $SUPPORT_API_KEY" \
  -H "Accept: application/json"
```

The endpoint returns up to 50 newest submissions:

```json
{
  "data": [
    {
      "id": "cmsubmission123",
      "submitterName": "Amira Khan",
      "submitterEmail": "amira@example.com",
      "responses": [
        {
          "fieldId": "cmfield123",
          "label": "What happened?",
          "type": "richtext",
          "value": "The login page returns an invalid session message."
        }
      ],
      "createdAt": "2026-10-05T14:30:00.000Z",
      "form": {
        "id": "2bf8df47-65f3-4f95-a6ac-bfbde9cb7301",
        "name": "Customer support"
      },
      "ticket": {
        "id": "cmticket123",
        "reference": "IT-184",
        "title": "Unable to access my account",
        "status": "OPEN"
      }
    }
  ]
}
```

Use `GET /submissions/{submissionId}` to retrieve a single submission. Before returning it to the browser, your backend must verify that the signed-in portal user owns that submission ID.

## 5. Show the ticket

```bash
curl "$SUPPORT_API_BASE_URL/tickets/cmticket123" \
  -H "Authorization: Bearer $SUPPORT_API_KEY" \
  -H "Accept: application/json"
```

Example response:

```json
{
  "data": {
    "id": "cmticket123",
    "reference": "IT-184",
    "title": "Unable to access my account",
    "description": "Submitted support request details",
    "status": "OPEN",
    "type": "Task",
    "createdAt": "2026-10-05T14:30:00.000Z",
    "updatedAt": "2026-10-05T14:35:00.000Z",
    "closedAt": null,
    "departmentId": "cmdepartment123",
    "subDepartment": {
      "id": "cmsubdepartment123",
      "name": "Service Desk"
    },
    "project": {
      "id": "cmproject123",
      "name": "Support"
    },
    "assignee": {
      "name": "Jordan Lee",
      "avatarUrl": null
    },
    "submission": {
      "id": "cmsubmission123",
      "submitterName": "Amira Khan",
      "submitterEmail": "amira@example.com"
    },
    "comments": []
  }
}
```

The API is intentionally read-only for ticket properties. The external portal cannot change status, priority, assignment, department, project, or other ticket fields.

## 6. Add a requester comment

```bash
curl "$SUPPORT_API_BASE_URL/tickets/cmticket123/comments" \
  -X POST \
  -H "Authorization: Bearer $SUPPORT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  --data '{
    "body": "I can reproduce this in both Chrome and Safari."
  }'
```

The comment body is required and can contain at most 10,000 characters.

Successful response:

```json
{
  "data": {
    "id": "cmcomment123",
    "body": "I can reproduce this in both Chrome and Safari.",
    "createdAt": "2026-10-05T14:42:00.000Z",
    "author": {
      "name": "Amira Khan",
      "email": "amira@example.com",
      "type": "requester"
    }
  }
}
```

## Server-side TypeScript client

The following client is suitable for a Node.js server, a server action, or a backend API route. Do not import it into a browser bundle.

```ts
const baseUrl = process.env.SUPPORT_API_BASE_URL;
const apiKey = process.env.SUPPORT_API_KEY;

if (!baseUrl || !apiKey) {
  throw new Error("Support API environment variables are missing");
}

type PortalField = {
  id: string;
  label: string;
  type: "text" | "richtext" | "email" | "number" | "select" | "file" | "checkbox" | "radio" | "date";
  isRequired: boolean;
  order: number;
  options: string[];
  childOptions: Record<string, string[]>;
  placeholder: string | null;
  helperText: string | null;
  validation: Record<string, unknown> | null;
  visibleWhen: Record<string, unknown> | null;
};

type PortalForm = {
  id: string;
  name: string;
  schemaVersion: number;
  defaultFields: Record<string, { label: string; placeholder: string }>;
  issues: Array<{ id: string; name: string }>;
  fields: PortalField[];
};

type PortalRequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  idempotencyKey?: string;
};

export async function portalRequest<T>(
  path: string,
  options: PortalRequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.idempotencyKey
          ? { "Idempotency-Key": options.idempotencyKey }
          : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      cache: "no-store",
    });

    const data = (await response.json().catch(() => ({}))) as T & {
      error?: string;
    };

    if (!response.ok) {
      const error = new Error(data.error ?? `Support API returned ${response.status}`);
      Object.assign(error, {
        status: response.status,
        retryAfter: response.headers.get("retry-after"),
      });
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}
```

Example usage:

```ts
const form = await portalRequest<{ data: PortalForm }>("/form");

const result = await portalRequest<{
  data: {
    submissionId: string;
    ticketId: string;
    ticketReference: string;
  };
}>("/form/submissions", {
  method: "POST",
  idempotencyKey: crypto.randomUUID(),
  body: {
    submitterName: currentUser.name,
    submitterEmail: currentUser.email,
    title: submittedForm.title,
    issueId: submittedForm.issueId,
    responses: submittedForm.responses,
  },
});
```

## Recommended portal backend routes

Your portal should expose its own authenticated routes rather than calling the support API directly from the browser. A typical structure is:

```text
Browser                         Your portal server                     Support API
GET /support/form        ->     GET /api/portal/v1/form          ->    form definition
POST /support/requests   ->     POST /form/submissions           ->    submission + ticket
GET /support/requests    ->     GET /submissions?email=...       ->    requester history
GET /support/tickets/:id ->     GET /tickets/:id                 ->    ticket + comments
POST /support/tickets/:id/comments
                          ->     POST /tickets/:id/comments       ->    requester comment
```

On every browser-facing route, verify the portal session and derive the requester's email from that session. Do not trust an email, submission ID, or ticket ID supplied by the browser until your server confirms it belongs to that user.

## Rate limits

Limits use a 60-second window and are enforced globally per API key and separately per API key/client IP.

| Operation | Limit |
| --- | ---: |
| Authentication attempts | 300 per IP |
| API discovery | 120 per key |
| Get form | 120 per key |
| List submissions | 60 per key |
| Get one submission | 120 per key |
| Get one ticket | 120 per key |
| Submit a form | 30 per key |
| Add a comment | 60 per key |

A limited request returns `429 Too Many Requests` with these headers:

```http
Retry-After: 60
X-RateLimit-Limit: 30
X-RateLimit-Window: 60
```

Wait for the `Retry-After` duration before retrying. Add a small random delay to concurrent retry workers to prevent another burst.

## Errors

Errors use a JSON body:

```json
{
  "error": "Human-readable error message"
}
```

Form validation errors also include field IDs:

```json
{
  "error": "Form validation failed",
  "fieldErrors": {
    "cmfield123": "What happened? is required"
  }
}
```

Common status codes:

| Status | Meaning |
| --- | --- |
| `400` | Invalid input, issue, email, field value, or query parameter |
| `401` | Missing, invalid, revoked, or expired API credentials |
| `403` | The key is not a portal key or does not allow writes |
| `404` | The requested key-scoped submission or ticket was not found |
| `409` | The API key has no linked support form |
| `413` | JSON request body exceeds 1 MB |
| `415` | JSON endpoint called without `Content-Type: application/json` |
| `429` | Rate limit exceeded |
| `500` | Unexpected server error |
| `503` | The selected issue's department is not operational |

Do not retry `400`, `401`, `403`, `404`, `409`, `413`, or `415` responses automatically. Retry `429` only after `Retry-After`. Retry transient `500` or `503` responses with exponential backoff; reuse the same idempotency key for submission retries.

## Security checklist

- Keep the API key on the server and in a managed secret store.
- Use HTTPS in every non-local environment.
- Never log the Authorization header, full API key, form answers, or comment bodies.
- Authenticate users in your portal before exposing submissions or tickets.
- Derive the requester email from the authenticated session.
- Store submission and ticket ownership in your portal database.
- Verify ownership before proxying submission, ticket, or comment requests.
- Escape all API-provided text when rendering it as HTML.
- Apply CSRF protection to your portal's cookie-authenticated mutation routes.
- Add your own per-user limits in addition to the API's per-key limits.
- Use a stable idempotency key for every logical form submission.
- Set outbound request timeouts and restrict redirects.
- Revoke the key immediately if it is exposed, then generate a replacement.
- Do not share one API key between tenants or unrelated portals.

## Operational notes

- Revoking a key immediately disables its linked support form and all API access.
- A revoked connection can be deleted only when it has no submission history.
- Form fields and issues can change. Avoid long-lived form caching.
- Ticket status values should be displayed as returned; do not hard-code a closed set unless your UI has a safe fallback.
- The API does not allow external users to edit ticket properties. They can only view tickets and add comments.
