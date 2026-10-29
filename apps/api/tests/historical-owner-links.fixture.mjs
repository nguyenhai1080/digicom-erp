// Immutable owner-approved link metadata; no raw donor records or amounts.
export const envelope={
  "format": "dgc-financial-link-decisions-v1",
  "snapshotHash": "47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d",
  "proposal": {
    "format": "dgc-financial-link-proposals-v1",
    "snapshotHash": "47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d",
    "postingAllowed": false,
    "approved": false,
    "proposals": [
      {
        "source": {
          "sheet": "49_INVOICE_DETAIL",
          "sheetId": 2033278190,
          "sourceRow": 73,
          "legacyId": "INV0108",
          "expectedRowHash": "4469bbc85e03f710bc160113cc2bf19271c6e04647cb778baf51935bf0244e9b",
          "field": "Revenue_ID",
          "expectedValue": "REV0159"
        },
        "target": {
          "sheet": "40_MONTHLY_REVENUE",
          "sheetId": 740584644,
          "sourceRow": 123,
          "legacyId": "REV0419",
          "expectedRowHash": "52d8cd17ed96d540f281c1c3cfa42af3bc9c69893ca0195a5babcd72ab42bdcc"
        },
        "evidence": {
          "fileId": "1DthEu3eQXifTSxcC8GZZfie7sgd0nYvz",
          "sha256": "1619ef24406d5840b424a424df1351dd604ba532707a12ccbe83b517362097d5",
          "relativePdfPath": "source-invoices/1DthEu3eQXifTSxcC8GZZfie7sgd0nYvz.pdf",
          "visualReview": "PDF service, period and amounts checked; AR belongs to same invoice",
          "invoiceId": "INV0023"
        },
        "state": "PROPOSED_AWAITING_OWNER",
        "changeSource": false,
        "changeMoney": false
      },
      {
        "source": {
          "sheet": "50_AR_AP",
          "sheetId": 557736695,
          "sourceRow": 16,
          "legacyId": "ARAP0015",
          "expectedRowHash": "fa6dceaa1b59f8939cec913dce62409e2b3e1f82ed6ece907d3579df75bc5ce2",
          "field": "Revenue_ID",
          "expectedValue": "REV0159"
        },
        "target": {
          "sheet": "40_MONTHLY_REVENUE",
          "sheetId": 740584644,
          "sourceRow": 123,
          "legacyId": "REV0419",
          "expectedRowHash": "52d8cd17ed96d540f281c1c3cfa42af3bc9c69893ca0195a5babcd72ab42bdcc"
        },
        "evidence": {
          "fileId": "1DthEu3eQXifTSxcC8GZZfie7sgd0nYvz",
          "sha256": "1619ef24406d5840b424a424df1351dd604ba532707a12ccbe83b517362097d5",
          "relativePdfPath": "source-invoices/1DthEu3eQXifTSxcC8GZZfie7sgd0nYvz.pdf",
          "visualReview": "PDF service, period and amounts checked; AR belongs to same invoice",
          "invoiceId": "INV0023"
        },
        "state": "PROPOSED_AWAITING_OWNER",
        "changeSource": false,
        "changeMoney": false
      },
      {
        "source": {
          "sheet": "49_INVOICE_DETAIL",
          "sheetId": 2033278190,
          "sourceRow": 78,
          "legacyId": "INV0113",
          "expectedRowHash": "a76ece4b82f8c1387cf751520a90908905fde28cac53085d925fbd7c6089a172",
          "field": "Revenue_ID",
          "expectedValue": "REV0419"
        },
        "target": {
          "sheet": "40_MONTHLY_REVENUE",
          "sheetId": 740584644,
          "sourceRow": 131,
          "legacyId": "REV0167",
          "expectedRowHash": "a7f034cbaba9edfb445637f915396f235981864c613f539a63b67c8b5cd3067c"
        },
        "evidence": {
          "fileId": "1n4N1PWe3o1hJozwM8Zom3asO9lyz0gyb",
          "sha256": "91a143b76cb010a9b6b10f3afa15c5a8723cfbaf5bceed86c5e7a0ca3ce15f1a",
          "relativePdfPath": "source-invoices/1n4N1PWe3o1hJozwM8Zom3asO9lyz0gyb.pdf",
          "visualReview": "PDF service, period and amounts checked; AR belongs to same invoice",
          "invoiceId": "INV0024"
        },
        "state": "PROPOSED_AWAITING_OWNER",
        "changeSource": false,
        "changeMoney": false
      }
    ],
    "proposalHash": "c55e2c0c55a1559d7f071f45f8900c930299ed2adb61f6c95249f3fd79cf9055"
  },
  "approval": {
    "approvedBy": "OWNER",
    "approvedAt": "2026-10-23T08:10:37Z",
    "decision": "APPROVE_ALL",
    "sourceChanged": false,
    "moneyChanged": false,
    "datesChanged": false,
    "pdfsChanged": false
  },
  "approvalHash": "a75b0238c43d73b8192fa1d26fdbb5bc99415266d75f4a3beb8c16833833d369"
};
