# OCR Receipt Extraction: Provider Research

Research date: 2026-08-14.

Status: input for ADR-0025. The adapter design follows this comparison and is validated against it before the production provider is configured.

## Scope

The first vertical slice extracts amount, date, vendor, and a best-effort category suggestion from PDF receipts only (ADR-0025). Every extracted value is an editable suggestion the employee confirms; OCR output is never silently written into a claim.

This document compares candidate providers on four axes: field-level accuracy, cost, data privacy, and integration fit with the server-side command boundary. Tesseract is included because the ADR names it as a fallback option; the local deterministic adapter in this slice replaces it, so Tesseract is assessed as a production option only.

## Candidates

1. Azure AI Document Intelligence, prebuilt receipt model (Azure-native, already the stack's cloud).
2. Amazon Textract, Analyze Expense API.
3. Google Cloud Document AI, Expense Parser processor.
4. Tesseract (open-source OCR, no receipt domain model).
5. Local deterministic adapter (pdf.js text layer plus heuristics). Not a cloud provider, but the production-relevant local baseline this slice ships.

## Accuracy for receipt fields

The relevant fields are total amount, transaction date, merchant name, and a category guess derived from line items.

- Azure Document Intelligence prebuilt receipt extracts merchant name, transaction date, total (currency-aware numeric value), and itemized lines with confidence scores per field. Microsoft trains it on a large receipt corpus, including printed and handwritten receipts, so it handles both text-layer PDFs and scanned images. Confidence per field is returned by the API and can gate which suggestions are shown.
- Amazon Textract Analyze Expense is purpose-built for receipts and invoices: it returns vendor, date, totals with per-field confidence and normalized currency. Accuracy on well-typed receipts is comparable to Azure's receipt model; strong handwriting support.
- Google Document AI Expense Parser extracts the same receipt facts. Its synchronous path is capped at 10 pages per document, which is fine for a single receipt but an operational constraint to note.
- Tesseract is an OCR engine, not a receipt parser. It returns a block of text and boxes; the application must build its own field extraction, layout recovery, and currency normalization on top. For cleanly printed text-layer PDFs it is competitive, but it degrades faster than the managed models on rotation, low contrast, and handwriting, and it provides no field-level confidence.
- Local deterministic adapter: extracts the PDF text layer with pdf.js and applies fixed heuristics. On text-layer PDFs (including the server-generated expense summary PDF) it is fully deterministic and accurate when receipts follow conventional layouts. It cannot read scanned images, which are deferred to a later slice anyway.

Conclusion: for structured receipt facts, the managed receipt models (Azure, AWS, Google) are clearly more accurate than Tesseract on the field level because they bundle a receipt domain model with OCR. The local adapter is the best zero-dependency baseline for text-layer PDFs.

## Cost

Prices are list rates for receipt-style extraction per 1,000 pages unless noted.

- Azure AI Document Intelligence: prebuilt models (receipt included) at $10 per 1,000 pages; the free F0 tier covers 500 pages per month for evaluation; the generic Read OCR tier is $1.50 per 1,000 pages. A single-page receipt therefore costs about $0.01.
- Amazon Textract: Analyze Expense at roughly $25 per 1,000 pages at the first tier (AWS pricing page list rate, $0.025 per page), with a limited free tier for new accounts.
- Google Document AI: Expense Parser at $10 per 1,000 pages ($0.10 per 10 pages), synchronous documents capped at 10 pages.
- Tesseract: free, open source, runs on the application's own machines. Total cost is the engineering cost of building and maintaining the field-extraction layer it lacks.
- Local deterministic adapter: free to run; engineering cost is a fixed one-time heuristic layer, which this slice already ships.

At ExpenseHive's expected volume (a few thousand claim receipts a month), provider cost is trivial on any managed option: roughly $10 to $25 per 1,000 receipts. Cost does not discriminate between Azure, AWS, and Google.

## Data privacy

Receipts contain employee spending data, and in India this interacts with digital-personal-data expectations; receipts should be treated as sensitive.

- Azure AI Document Intelligence: data is processed in the configured Azure region, encrypted in transit and at rest, and analysis results are retained only for the polling window (about 24 hours) before deletion; a delete-result call can remove them sooner. No training happens on customer content. The app already stores receipts in Azure Blob Storage, so the data plane stays inside the same cloud tenancy.
- Amazon Textract: same in-region, no-training-on-content model. Receipts would leave the existing Azure tenancy and enter an AWS account, a new cross-vendor data boundary for this application.
- Google Document AI: in-region processing, no training on content, but again a new vendor boundary.
- Tesseract and the local adapter: bytes never leave the server. This is the strongest privacy posture, at the cost of the field-level accuracy of the managed models.

All three managed providers can be made compliant with "processed in a declared region, not used for training, deleted after processing." The differentiator is tenancy consistency: only Azure keeps receipt bytes and extraction in the same cloud.

## Integration fit with the server-side command boundary

The extraction port sits behind the command boundary as a provider adapter, mirroring the blob and email adapters (ADR-0004): one interface, a production adapter selected by configuration, and a local fallback that development and tests always use.

- Azure AI Document Intelligence: a single REST endpoint family (analyze with the prebuilt-receipt model, then poll the operation location), authenticated by a key header or Azure AD. The adapter maps the fields document to the suggestion shape directly. The SDK or a thin REST client both fit the existing `src/server/blob` adapter pattern. Runs on the Node runtime already in use.
- Amazon Textract and Google Document AI: equally simple REST or SDK adapters behind the same interface. The integration cost is roughly equal; the real cost is the second cloud vendor and its credential management in an otherwise all-Azure stack.
- Tesseract: needs a WASM runtime (tesseract.js) or a system binary on the server, plus the application-owned field-extraction layer. Heavier operational surface than the local pdf.js adapter, which needs nothing new.
- Local deterministic adapter: already-installed pdf.js plus pure functions, zero new dependencies, deterministic for tests. This is why the slice ships it instead of Tesseract as the dev fallback.

## Recommendation

Azure AI Document Intelligence, prebuilt receipt model, as the production adapter.

Rationale: it leads the ADR's shortlist, it is the only candidate inside the existing Azure tenancy (receipts already live in Azure Blob Storage), it prices at the same order as the alternatives ($10 per 1,000 pages), it returns exactly the needed fields with per-field confidence, and it drops into the adapter seam with the least architectural friction. AWS Textract and Google Document AI are credible equals on accuracy and price, and should be re-evaluated only if tenancy strategy changes. Tesseract is not a production candidate: the app would own the field-extraction layer it lacks, with worse results on scans.

The local deterministic adapter (pdf.js text layer plus heuristics) is the local fallback and test baseline, replacing the ADR's "Tesseract or a deterministic stub" option with something cheaper to run and fully deterministic.

## What the production adapter requires

- An Azure AI Document Intelligence resource with the prebuilt receipt model enabled.
- Configuration: `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` and `AZURE_DOCUMENT_INTELLIGENCE_API_KEY` (or Azure AD credential handling when key auth is retired). The composition seam throws in production when these are absent, mirroring the blob adapter.
- API version pinning on the analyze call (e.g. `2024-11-30`) so behavior changes stay deliberate.
- Mapping of the receipt fields document to the suggestion shape: `Total` to amount in minor units, `TransactionDate` to an ISO date, `MerchantName` to vendor, and the extracted text lines through the same category keyword heuristic the local adapter uses, so the two adapters agree on category guessing.
- Per-field confidence surfacing so low-confidence suggestions can be omitted (the local adapter stays confidence-free; a later slice can add the threshold).
- Region selection for data residency (India region preferred for this app's receipts), and use of the delete-result API after polling completes.
- No new data is stored: extraction results live only in the response, exactly like the local adapter.

## Sources

- Azure Document Intelligence pricing: https://azure.microsoft.com/en-us/pricing/details/document-intelligence/
- Azure Document Intelligence prebuilt receipt model: https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/receipt?view=doc-intel-4.0.0
- Amazon Textract pricing (Analyze Expense): https://aws.amazon.com/textract/pricing/
- Google Document AI pricing (Expense Parser): https://cloud.google.com/products/document-ai/pricing
- Azure Document Intelligence pricing detail: https://aitoolsatlas.ai/tools/microsoft-azure-ai-document-intelligence
