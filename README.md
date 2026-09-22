# 🧪 Fatima Lab Manager

**Fatima Lab Manager** is an offline-first desktop application I built for managing the day-to-day administrative and financial operations of a diagnostic laboratory.

The application brings patient registration, billing, doctor referral commissions, expenses, outstanding dues, financial summaries, reporting, and database backups together in a single desktop application.

It is designed primarily for environments where **simplicity, reliability, privacy, and offline availability** matter. Patient and financial data is stored locally, so the application does not require a cloud database or an internet connection to perform its core operations.

---

## ✨ What I Built

I built Fatima Lab Manager around the actual workflow of a diagnostic laboratory rather than treating it as a generic accounting or CRUD application.

The application covers the complete workflow from registering a patient and generating their bill to tracking payments, calculating doctor commissions, recording expenses, and reviewing the laboratory's financial performance.

Some of the main areas include:

* 👤 Patient registration and billing
* 🧾 Payment and outstanding-dues tracking
* 👨‍⚕️ Doctor referral and commission management
* 💰 Operational expense management
* 📊 Financial dashboard and daily/monthly analytics
* 📑 Doctor-specific reporting
* 📤 Excel report generation
* 🔐 Local password-protected access
* 💾 Automatic and manual database backups
* 📴 Offline-first local data storage

---

# 🚀 Key Features

## 👤 Patient Registration & Billing

The patient management system is designed for quick data entry at a laboratory reception/front desk.

### Automatic Lab Numbering

Patient records can receive automatically generated laboratory numbers while still supporting custom numbering formats where required.

### Complete Billing Lifecycle

Each patient record keeps track of:

* Gross fee
* Discount
* Net payable amount
* Amount paid
* Outstanding balance

This makes it possible to distinguish between the amount billed and the amount actually collected.

### ⚡ Fast Keyboard-Based Workflow

The billing workflow is optimized for reception-desk usage.

Common operations can be performed without constantly switching between the keyboard and mouse, including:

* Tab/Enter-based field navigation
* Quick saving with `Ctrl + Enter`
* Fast patient lookup
* Filtering and navigation

### Historical & Backdated Entries

The application handles historical entries based on the **patient's visit date**, rather than simply relying on when the record was entered into the system.

This is important in real-world laboratory environments where a record may occasionally need to be entered after the actual visit.

### Search & Filtering

Patient records can be filtered by:

* Date range
* Month
* Specific day
* Referring doctor
* Patients with outstanding dues

---

# 👨‍⚕️ Doctor Referral & Commission Management

Doctor referrals are an important part of many diagnostic laboratory workflows, so I built dedicated functionality for managing them.

### Doctor Directory

Doctors can be added and managed with configurable commission percentages.

Commission rates can range from:

```text
0% → 100%
```

### SELF / Walk-in Patients

Patients who do not have a referring doctor can be assigned to the dedicated `SELF` referral category.

These patients carry a `0%` commission rate.

### Safe Doctor Archiving

Doctors can be deactivated without deleting their historical records.

This means older patient records and financial reports remain intact even when a doctor is no longer actively referring patients.

### Commission Based on Actual Collections

One of the important business rules in the application is that doctor commissions are calculated from **amounts actually collected**, rather than simply from the billed amount.

For example, if:

```text
Patient Bill:       Rs. 5,000
Amount Paid:        Rs. 3,000
Doctor Commission:  10%
```

the commission is calculated from the collected amount:

```text
Rs. 3,000 × 10% = Rs. 300
```

rather than:

```text
Rs. 5,000 × 10% = Rs. 500
```

This prevents commissions from being treated as payable when the corresponding patient payment has not actually been collected.

### Doctor Reports

Doctor-specific reports can be generated for selected date ranges and include information such as:

* Number of referred patients
* Revenue generated
* Amount collected
* Outstanding dues
* Commission payable

---

# 💰 Expense Management

The application also provides a dedicated system for recording laboratory operating expenses.

Expenses can include things such as:

* Laboratory supplies
* Equipment
* Staff wages
* Utilities
* Transportation
* Outsourced testing
* Other operational costs

### Custom Expense Categories

Expense categories can be created and managed directly within the application.

Categories can also be deactivated without removing historical expense records.

### Search & Filtering

Expenses can be searched and filtered by:

* Date
* Category
* Description
* Month

This makes it easier to review and audit operational spending.

---

# 📊 Financial Dashboard

The dashboard provides a high-level view of the laboratory's financial activity.

Depending on the selected period, it can display:

* 👥 Total patients
* 💵 Gross fees
* 🏷️ Discounts
* 💰 Net sales
* 💳 Amount collected
* ⏳ Outstanding dues
* 💸 Total expenses
* 👨‍⚕️ Doctor commissions payable
* 📈 Net profit / balance

## 📅 Daily Activity

The dashboard also provides a daily comparison between:

* Patient collections
* Laboratory expenses

This makes it easier to understand how the laboratory's financial activity changes throughout a month.

### Day-Level Drill Down

A specific day can be selected to inspect the underlying activity for that date, including:

* Patients registered
* Payments collected
* Expenses recorded

This provides a bridge between the high-level dashboard and the actual records behind the numbers.

---

# 📑 Reporting & Excel Export

Fatima Lab Manager supports exporting filtered data to Excel spreadsheets using **ExcelJS**.

Reports are generated as `.xlsx` files with formatting intended to make them immediately usable rather than simply exporting raw database rows.

Exported spreadsheets can include:

* Formatted headers
* Auto-filters
* Frozen header rows
* Currency formatting
* Decimal formatting
* Structured report data

Reports can be generated for patient records as well as doctor referral information.

---

# 🔐 Privacy & Security

The application was designed with local data ownership in mind.

## 📴 Offline-First

The core application does not require a cloud database or an internet connection.

Patient and financial records are stored locally on the computer running the application.

This makes the application suitable for laboratory environments where internet availability may be unreliable or where keeping operational data locally is preferred.

## 🔑 Password-Protected Access

The application includes local authentication using password hashing based on Node.js's native:

```text
crypto.scryptSync
```

with cryptographic salts.

Passwords are therefore not stored as plain text.

## 💾 Automatic Backups

The application automatically creates rolling database backups.

The backup system:

* Creates daily database snapshots
* Stores backups locally
* Retains the latest 30 daily backups
* Helps protect against accidental data loss

## 📦 Manual Backup & Restore

Users can also manually create database backups and restore a previous database through the application's backup/restore workflow.

Restoration is handled with safety checks to reduce the risk of accidentally overwriting the active database.

---

# 🏗️ Application Architecture

Fatima Lab Manager is built as a desktop application using Electron.

At a high level, the application works like this:

```text
┌─────────────────────────────┐
│        Electron App         │
│                             │
│   UI / Vanilla JavaScript   │
│   HTML / CSS                │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│        Application Logic    │
│                             │
│  Patient Management         │
│  Billing                    │
│  Doctor Commissions         │
│  Expenses                   │
│  Reports                    │
│  Backups                    │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│          sql.js             │
│     SQLite / WebAssembly    │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│       Local SQLite DB       │
│           .db               │
└─────────────────────────────┘
```

The database layer uses **`sql.js`**, which provides SQLite compiled to WebAssembly.

This approach allows the application to use SQLite without requiring a separate native database server or external database installation.

The result is a portable local database architecture that fits the application's offline-first requirements.

---

# 🛠️ Tech Stack

| Technology              | Purpose                     |
| ----------------------- | --------------------------- |
| **Electron**            | Desktop application runtime |
| **JavaScript**          | Application logic           |
| **HTML / CSS**          | User interface              |
| **sql.js**              | SQLite through WebAssembly  |
| **SQLite**              | Local persistent database   |
| **ExcelJS**             | Excel report generation     |
| **Node.js**             | Desktop/backend runtime     |
| **Node.js `crypto`**    | Password hashing            |
| **Inter Variable Font** | Application typography      |

The UI is intentionally built using standard web technologies rather than relying on a large frontend framework.

---

# 📂 Project Structure

The project is organized around the Electron application's source code, static assets, and configuration.

```text
fatima-lab-manager/
│
├── assets/
│   └── ...
│
├── src/
│   └── ...
│
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

The exact source structure may evolve as the application grows, but the goal is to keep the application's UI, business logic, database operations, and supporting resources clearly separated.

---

# 💾 Data Storage

Application data is stored locally.

By default, the application uses:

### Windows

```text
%USERPROFILE%\Documents\Fatima Lab Data\
```

### Portable Mode

```text
<PortableExecutableDir>\Fatima Lab Data\
```

### Automatic Backups

Daily backups follow the format:

```text
fatima-lab-YYYY-MM-DD.db
```

The automatic rolling backup system retains up to **30 daily snapshots**.

---

# 🖥️ Compatibility

The application is designed primarily as a lightweight desktop application and aims to work across multiple environments.

### Supported / Target Environments

* Windows 10
* Windows 11
* Linux
* Legacy Windows environments where a compatible Electron build is available
* Wine environments where applicable

The application also avoids requiring a separately installed database server, which simplifies deployment on machines used by laboratory staff.

> Compatibility with older systems can depend on the specific Electron build and operating-system architecture. Legacy Windows/Wine environments should therefore be tested with the corresponding packaged build.

---

# 📸 Screenshots

Screenshots can be added here to showcase the main parts of the application.

### Dashboard

![Dashboard](docs/screenshots/dashboard.png)

### Patient Billing

![Patient Billing](docs/screenshots/patient-billing.png)

### Doctor Reports

![Doctor Reports](docs/screenshots/doctor-reports.png)

### Expense Management

![Expense Management](docs/screenshots/expenses.png)

> Replace the example paths above with the actual screenshots from the application.

---

# 🚀 Getting Started

## Prerequisites

You will need:

* Node.js 18 or newer
* npm

Check your installed versions:

```bash
node --version
npm --version
```

## Clone the Repository

```bash
git clone git@github-faaizali:faaizali/fatima-lab-manager.git
```

Or using HTTPS:

```bash
git clone https://github.com/faaizali/fatima-lab-manager.git
```

## Install Dependencies

```bash
cd fatima-lab-manager
npm install
```

## Start the Application

```bash
npm start
```

---

# 🧑‍💻 Development

During development, the application can be run directly through Electron using the project's npm scripts.

```bash
npm start
```

Additional build/package commands depend on the Electron packaging configuration defined in `package.json`.

---

📦 Building the Application

Fatima Lab Manager currently uses Electron directly for development and packaging.

The application can be packaged as a standalone Windows application using Electron Packager.

Install the Packager

If it is not already installed:

npm install --save-dev @electron/packager
Build the Windows 32-bit Version

The current release is specifically configured as a Windows 7 32-bit edition.

Run:

npm run build:win32

The build command packages the application for the 32-bit Windows architecture:

win32 / ia32

The generated application will be placed inside:

dist/
└── Fatima Lab Manager-win32-ia32/
    ├── Fatima Lab Manager.exe
    ├── resources/
    ├── locales/
    └── ...

The resulting application is a portable Windows application, meaning it does not require a traditional installation process. The generated folder can be copied to a Windows machine and the executable can be launched directly.

Build Command

The package.json contains the following build script:

{
  "scripts": {
    "start": "electron .",
    "build:win32": "electron-packager . \"Fatima Lab Manager\" --platform=win32 --arch=ia32 --out=dist --overwrite"
  }
}

Therefore, the complete build workflow is:

npm install
npm run build:win32

# 🔄 Database & Backup Philosophy

The application treats the local database as important operational data rather than disposable application state.

The backup strategy therefore provides multiple layers of protection:

```text
                Application
                     │
                     ▼
              Active Database
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
   Manual Backup        Automatic Daily Backup
                                │
                                ▼
                       Rolling 30-Day History
```

This makes it possible to recover from accidental changes, database corruption, or other local data-loss scenarios without requiring a cloud service.

---

# 🩺 Scope

Fatima Lab Manager is intended for **administrative and financial management of diagnostic laboratories**.

It handles operational workflows such as:

* Patient registration
* Billing
* Payments
* Doctor referrals
* Commissions
* Expenses
* Financial reporting

It is **not a medical diagnostic system** and does not provide medical diagnoses or clinical decision support.

---

# 🔒 Data & Privacy

The application's core functionality is designed around local data storage.

No cloud database is required for normal operation, and patient/financial records remain on the machine where the application is installed unless a user explicitly copies or transfers the database or exported reports.

Because this application can handle sensitive laboratory information, users should still follow appropriate local security practices, including:

* Protecting the computer with an operating-system password
* Restricting access to the application/database
* Keeping backups secure
* Avoiding unnecessary sharing of exported reports
* Using appropriate filesystem permissions

---

🪟 Windows Compatibility

The current 1.0.2-win7 release is specifically intended to provide a 32-bit Windows build for legacy systems.

The package targets:

Platform: Windows
Architecture: 32-bit (ia32)
Release: 1.0.2-win7

The application is designed to minimize external dependencies by using a local SQLite database through sql.js and packaging the Electron runtime together with the application.

Compatibility with legacy Windows versions depends on the Electron runtime and the specific packaged build. The Windows 7 edition should therefore be tested on the target Windows 7 hardware before deployment.

The same application architecture can also be packaged for newer Windows systems using an appropriate Electron target.

---

# 📦 Deployment

The application is intended to be packaged as a standalone Electron desktop application so that end users do not need to manually install or configure a database server.

The portable/local architecture also makes deployment significantly simpler for laboratory environments.

---

# 📝 License

**Private / Proprietary**

Developed for **Fatima Lab**.

The source code and application are not licensed for redistribution, modification, or commercial use without explicit permission from the copyright holder.

---

## ❤️ Why I Built It

Fatima Lab Manager started as a personal project for my dad and his day-to-day work at the laboratory.

I wanted to build something that would solve the actual problems he encountered instead of creating another generic management system with features that weren't useful in the real workflow.

The goal was to make everyday laboratory operations faster and more reliable — from registering patients and collecting payments to tracking outstanding dues, managing doctor commissions, recording expenses, and reviewing the laboratory's financial performance.

Building it for someone who would actually use it also shaped many of the application's design decisions. The interface, keyboard shortcuts, reporting workflows, backup system, and offline-first architecture were all developed with practical day-to-day use in mind.

What started as a project for my dad eventually became a complete desktop application focused on making laboratory management **simpler, faster, and more dependable**.

> Built with code, but driven by a real-world need.
