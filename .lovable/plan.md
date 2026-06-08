## Phase 1 — GST Invoicing + Deposits + Overdue + WhatsApp notifications

You picked **GST invoicing + deposits** first. Manual GST entry per invoice, 30-day overdue threshold, WhatsApp/SMS notifications via Twilio. Remaining items (purchase vs sales separation, separate reports, multi-search) will be tackled in Phase 2.

### Database changes (migration)

**customers** — add fields
- `customer_number` (auto: `CUST-0001`), `gst_number`, `deposit_balance` (running total)

**cylinder_types** — add
- `hsn_code` (default per type, overridable on invoice)

**invoices** — extend for full GST invoice
- `gst_number`, `hsn_code`, `taxable_amount`, `discount`, `deposit_amount`, `cgst_rate`, `cgst_amount`, `sgst_rate`, `sgst_amount`, `roundoff`, `total`, `billing_date`, `return_date`
- `cylinder_ids` (uuid[]) so one invoice can include multiple cylinders

**invoice_items** — new table
- For line items: cylinder_id, type_id, qty, rate, hsn, taxable, cgst, sgst, total

**customer_deposits** — new table (ledger)
- `customer_id`, `type` (`collected` | `refunded` | `adjusted`), `amount`, `cylinder_id` (nullable), `occurred_at`, `notes`
- Trigger: on insert, update `customers.deposit_balance`
- Trigger: on insert, queue a WhatsApp notification

**cylinders** — already has `current_customer_id` + status. Add `issued_at` so 30-day overdue can be computed.

### Frontend

**Customers page**
- Show customer number, GST, current deposit balance
- "Adjust deposit" button → collect / refund with amount + date
- Badge **"Cylinder overdue"** in red on customers with any cylinder issued > 30 days ago

**Invoices page → new "GST invoice" dialog**
Form fields exactly as you listed: customer (auto-fills GST), invoice no (auto), date, HSN, multiple cylinder rows (serial + rate), discount, deposit, CGST %, SGST %, roundoff → live total. Print-friendly view.

**Dashboard**
- New tile: **Overdue cylinders** (count + list)

### Notifications (WhatsApp via Twilio)

Edge function `notify-deposit-change` triggered after deposit insert. Sends WhatsApp message to `customer.phone` with new balance.

Requires the **Twilio connector** — I'll prompt you to connect it (Account SID + Auth token + Twilio WhatsApp number) before I deploy the function. If you'd rather skip WhatsApp for now and just log notifications in-app, say so.

### Out of scope for Phase 1 (next turn)
- Purchase vs sales separation (purchase challan, purchase bill, separate purchase report)
- Search by customer no / cylinder no / name
- Dead cylinder list per customer
- Separate purchase & sale reports

### Order of execution
1. Run migration (schema + triggers)
2. Update Customers, Invoices, Dashboard UI
3. Set up Twilio connector + deploy notification edge function

Approve and I'll start with the migration.