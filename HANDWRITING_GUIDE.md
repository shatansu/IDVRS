I have an existing web application with:

Frontend: React
Backend: Python FastAPI
Current frontend content is mostly hardcoded in Hindi.
I want to add exactly two languages:
Hindi (hi)
English (en)
PRIMARY REQUIREMENT

Add complete Hindi + English multilingual support to the existing application WITHOUT changing the existing UI, design, layout, styling, responsiveness, or functionality.

This is extremely important:

Do NOT redesign the frontend.
Do NOT change the existing UI.
Do NOT change the existing user flow.
Do NOT change existing functionality.
Do NOT change component behavior unless required strictly for language switching.

The application should look and behave exactly as it does now. The ONLY visible addition should be a small language selector/toggle for switching between Hindi and English.

1. FIRST ANALYZE THE EXISTING PROJECT

Before making changes:

Inspect the complete React frontend structure.
Inspect all pages, components, layouts, forms, buttons, menus, modals, tables, cards, validation messages, placeholders, tooltips, alerts, toast messages, empty states, loading states, error messages, etc.
Search the entire frontend for hardcoded Hindi text.
Inspect the FastAPI backend and identify Hindi text returned by APIs.
Identify which text comes from the database/API and which text is frontend-only.
Understand the current routing, state management, API layer, authentication, and existing architecture.

Do not start by rewriting or restructuring the project.

Work with the existing architecture as much as possible.

2. FRONTEND MULTILINGUAL SYSTEM

Implement a proper i18n system for React.

Prefer using a mature i18n solution such as i18next + react-i18next, unless the existing project already has an i18n solution. If an existing solution is present, extend it instead of adding another one.

Create translation resources similar to:

src/
  i18n/
    en.json
    hi.json


or follow the existing project's structure if there is already a suitable localization folder.

Example:

{
  "welcome": "Welcome",
  "login": "Login",
  "submit": "Submit"
}


Hindi:

{
  "welcome": "स्वागत है",
  "login": "लॉगिन",
  "submit": "जमा करें"
}


Replace hardcoded user-facing Hindi strings with translation keys.

Do NOT translate:

Variable names
Function names
Component names
API field names
Database IDs
Internal logic
Code comments unless necessary
URLs
Routes
Technical identifiers

Only user-facing content should be localized.

3. LANGUAGE SELECTOR

Add a Hindi/English language selector to the existing frontend.

Important:

Keep it visually consistent with the existing UI.
Do not redesign the navbar/header.
Do not introduce a large new UI element.
Place it in the most appropriate existing header/navbar area.
Use the existing CSS/design system/components where possible.

Options should be:

हिन्दी
English


When the user selects Hindi:

Language = hi


When the user selects English:

Language = en

4. LANGUAGE PERSISTENCE

The selected language must persist after:

Page refresh
Browser reload
Navigation between pages

Use the project's existing persistence/state mechanism if appropriate.

Otherwise, use localStorage.

For example:

language = hi


or

language = en


Default language should remain Hindi because the existing application is currently Hindi.

So:

First-time user → Hindi
User selects English → English
Refresh → English remains selected
User selects Hindi → Hindi remains selected

Do not unexpectedly change the current default behavior.

5. TRANSLATE THE ENTIRE FRONTEND

Do NOT translate only the homepage.

Search the complete React codebase and localize ALL user-facing Hindi text, including:

Navbar
Sidebar
Dashboard
Login
Registration
Profile
Forms
Buttons
Labels
Headings
Paragraphs
Tables
Cards
Dropdowns
Select options
Checkboxes
Radio buttons
Modal dialogs
Confirmation dialogs
Validation messages
Error messages
Success messages
Toast notifications
Alerts
Loading messages
Empty states
Search messages
Pagination text
Tooltips
Placeholders
Accessibility labels
Browser-visible UI strings
Any other user-facing Hindi content

There must be no accidental Hindi text left behind in the UI when English is selected.

Also ensure there is no accidental English text left untranslated where the application currently has Hindi user-facing text.

6. DO NOT DUPLICATE PAGES

Do NOT create separate pages/components such as:

HindiHome.jsx
EnglishHome.jsx
HindiDashboard.jsx
EnglishDashboard.jsx


Do not duplicate the application.

Keep the existing components and dynamically render translated strings.

For example, convert:

<h1>स्वागत है</h1>


into something equivalent to:

<h1>{t("welcome")}</h1>


The same component should work for both languages.

7. BACKEND / FASTAPI

Inspect the FastAPI backend for user-facing Hindi responses.

If the backend returns messages such as:

{
  "message": "आपका आवेदन सफलतापूर्वक जमा हो गया है"
}


implement appropriate language handling.

Use the standard HTTP header approach where practical:

Accept-Language: hi


or:

Accept-Language: en


The React frontend should send the currently selected language to the API where backend translation is required.

Do not change existing API contracts unnecessarily.

Do NOT rename existing API endpoints, request fields, response fields, database fields, or authentication behavior unless absolutely required.

Backward compatibility is important.

8. DATABASE CONTENT

If some Hindi content is coming dynamically from the database/API rather than being hardcoded in React, identify it separately.

Do NOT blindly replace database content with frontend translation keys.

For dynamic content, determine the safest existing architecture.

If multilingual database content is required, prefer a scalable translation structure rather than randomly adding duplicate fields everywhere.

For example, a translation table/model can be considered:

content_translation
-------------------
id
content_id
language
title
description


However:

Do not modify the database schema automatically unless it is actually required.

First inspect how the existing application stores and uses the content.

Avoid destructive migrations.

9. API ERROR AND SUCCESS MESSAGES

Pay special attention to FastAPI errors and frontend-generated messages.

For example:

Hindi:

डेटा सफलतापूर्वक सेव हो गया।


English:

Data saved successfully.


The same applies to:

400 errors
401 errors
403 errors
404 errors
422 validation errors
500 errors
Custom business errors
Success responses
Warning messages

Do not break existing error handling while adding translations.

10. UI MUST NOT CHANGE

This requirement has the highest priority.

After implementation, the following should remain unchanged:

Existing colors
Fonts
Font sizes
Spacing
Padding
Margins
Borders
Shadows
Icons
Button styles
Cards
Tables
Forms
Responsive behavior
Desktop layout
Mobile layout
Existing animations
Existing navigation
Existing functionality
Existing API behavior

Only add the language selector and the minimum code required for localization.

Do not "improve" or refactor unrelated UI.

11. FUNCTIONALITY MUST NOT CHANGE

Do not modify existing business logic.

Do not break:

Authentication
Login/logout
Registration
API calls
Forms
Form validation
CRUD operations
Search
Filters
Pagination
File uploads
Downloads
Navigation
Routing
Permissions
Role-based access
State management
Notifications
Existing integrations

Language switching must be an additional capability, not a replacement for existing behavior.

12. TRANSLATION QUALITY

English translations should be natural and professional.

Do not perform literal/awkward word-for-word translations where a natural English UI term is more appropriate.

Maintain consistent terminology throughout the application.

For example, if one place uses:

Submit


do not translate the same action elsewhere as:

Send


unless the context is genuinely different.

Create reusable translation keys for repeated terms.

13. DYNAMIC VALUES

Do not translate or modify dynamic values incorrectly.

For example:

"Welcome, {{name}}"


should remain dynamically generated.

Similarly preserve:

User names
Numbers
Dates
IDs
Amounts
API values
Counts
URLs
File names

Only translate the surrounding static text.

14. LANGUAGE SWITCHING WITHOUT PAGE RELOAD

If practical with the existing architecture, changing the language should update visible text immediately without a full browser reload.

Do not introduce unnecessary complexity if the existing application architecture makes this unsafe.

15. RTL IS NOT REQUIRED

Both Hindi and English are left-to-right languages.

Do not introduce RTL logic.

16. CODE QUALITY

Keep the implementation clean and maintainable.

Avoid:

Duplicate translation keys
Duplicate pages
Duplicate components
Hardcoded language checks everywhere
Large conditional blocks such as:
if (language === "hi") {
   ...
} else {
   ...
}


Prefer translation keys:

t("someKey")


Keep translation logic centralized.

17. IMPORTANT SAFETY RULE

Before modifying anything, inspect the existing code.

Do not make assumptions about:

Folder structure
State management
API architecture
Database structure
Authentication
Routing
Existing libraries

Use what already exists.

Do not replace working libraries or architecture merely to implement i18n.

18. TESTING

After implementation, test BOTH languages.

Test:

Hindi
Login → Dashboard → Forms → Submit → Success/Error → Logout

English
Login → Dashboard → Forms → Submit → Success/Error → Logout


Also test:

Page refresh
Direct URL navigation
Browser back/forward
Mobile responsive layout
Desktop layout
Form validation
API errors
API success messages
Empty states
Loading states
Modals
Toasts
Authentication
Protected routes

Make sure switching languages does not introduce UI layout breakage.

19. FINAL VERIFICATION

Before finishing, perform a project-wide search for hardcoded Hindi user-facing strings.

When English is selected, there should be no unintended Hindi UI text remaining.

Also verify that Hindi still works correctly after all strings have been moved to translation resources.

Check for:

Missing translation keys
Incorrect translation keys
Console errors
React warnings
Broken imports
API errors
Runtime errors
Layout regressions
FINAL GOAL

The final application should behave exactly like the current application.

The only major new capability should be:

┌─────────────────────────────┐
│ Existing UI       हिन्दी | English │
└─────────────────────────────┘


Hindi should remain the default language.

English should be selectable.

The entire user-facing application should switch between Hindi and English.

DO NOT redesign, refactor, or alter the existing UI/functionality unnecessarily.

Before making any significant architectural or database change, explain what needs to change and why, instead of making a risky change automatically.