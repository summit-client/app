-- 0060 · Index the 2026 HR policy documents
--
-- The six documents the organization supplied, loaded into `hr_policies` so
-- the Policies & Handbook screen has something to show. Until now that table
-- was empty in every environment, so the screen fell back to the starter
-- policies in apps/employee/lib/hr-store.ts - placeholder text that was never
-- anybody's actual policy.
--
-- THE DOCUMENTS ARE SERVED FROM THIS APP, NOT FROM A DRIVE LINK
--
-- The one policy that previously had a URL pointed at Google Drive. A Drive
-- file only renders in an iframe when it is shared "anyone with the link",
-- which for an employee handbook is the wrong sharing setting - so the preview
-- was either blank or a sign-in wall, with nothing on screen to say why.
-- The files now live in apps/employee/public/hub-docs/ and are served from the
-- same origin as the page, so the frame is not a cross-origin request at all.
--
-- VERSIONS AND DATES ARE WHAT THE DOCUMENTS ACTUALLY SAY
--
-- Only the two handbooks state a version, in their filenames: "(V2) - Feb
-- 2026" and "Final V1 February 2026". The four MOU016 policies state no
-- version and no effective date anywhere in their text - the "DATE:" lines in
-- them are signature placeholders, not commencement dates. So their version is
-- recorded as "Feb 2026", which is what the document set is dated, and the
-- effective_date is the file date.
--
-- That is a real limitation and it should not be papered over: an
-- administrator needs to confirm the commencement dates and replace them.
-- Inventing "1.0" and a plausible January date would have made the
-- acknowledgement trail cite a version number nobody ever published.
--
-- `owner` is left null for the same reason. None of the documents names a
-- policy owner, and the acknowledgement record is more useful with an honest
-- blank than with a guessed job title.
--
-- WHAT IS DELIBERATELY NOT HERE
--
-- The same folder contains four Contracts of Employment. The Policies module's
-- own header excludes employment contracts, offer letters and compensation
-- agreements by design, and they were not in the list to index. They stay out.
--
-- Re-runnable: keyed on (clinic_id, name, version), which is the table's own
-- unique constraint, so applying this twice updates rather than duplicates.
--
-- Guarded on the clinic existing. A seed that hard-fails when its target
-- organization is absent blocks every later migration on any database that is
-- not this one - a fresh test database, a second tenant, a restored dump taken
-- before that row. Skipping is the right behaviour: there is nobody to seed
-- policies for.
do $seed$
begin
if not exists (select 1 from clinics where id = 'ee78d13c-eec9-4512-98bc-d00bca2d08c9') then
  raise notice 'Mount Etna clinic not present; skipping the 2026 HR policy seed.';
  return;
end if;

insert into hr_policies (clinic_id, name, version, effective_date, document_url, body, required)
values ('ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Employee Handbook', 'V2 (Feb 2026)', '2026-02-08', '/hub-docs/employee-handbook-v2-feb-2026.pdf', null, true)
on conflict (clinic_id, name, version) do update
   set effective_date = excluded.effective_date,
       document_url   = excluded.document_url,
       body           = excluded.body,
       required       = excluded.required;

insert into hr_policies (clinic_id, name, version, effective_date, document_url, body, required)
values ('ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Supervisor Handbook', 'V1 (Feb 2026)', '2026-02-11', '/hub-docs/supervisor-handbook-v1-feb-2026.pdf', null, false)
on conflict (clinic_id, name, version) do update
   set effective_date = excluded.effective_date,
       document_url   = excluded.document_url,
       body           = excluded.body,
       required       = excluded.required;

insert into hr_policies (clinic_id, name, version, effective_date, document_url, body, required)
values ('ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Right to Disconnect Policy', 'Feb 2026', '2026-02-08', '/hub-docs/right-to-disconnect-policy.docx', 'Right to Disconnect Policy

SUMMARY

Mount Etna Child & Family Services is committed to the health and wellbeing of our employees. It is of the utmost importance to the Business and we encourage and support our employees to prioritize their own wellbeing.

The company recognizes that our employees have the right to, and should, disconnect from work outside of their normal working hours unless there is an agreement to do so (for example while “on-call”).

APPLICATION AND SCOPE

This Policy is made pursuant to the requirements of the Working for Workers Act, 2021. This Policy will be reviewed and updated on an annual basis or as necessary to account for legislative changes.
For purpose of this Policy and as per the Employment Standards Act, 2000 (“ESA”), “disconnecting from work” is defined as follows:
   “not engaging in work-related communications, including emails, telephone calls, video calls or the sending or reviewing of other messages, so as to be free from the performance of work”

Employees must receive and sign off on this policy within 30 days from their date of hire.

EMPLOYMENT STANDARDS

The Business is committed to ensuring that its employment practices are in compliance with the ESA, the Ontario Human Rights Code (the “Code”) and other applicable employment-related legislation.

EMPLOYER AND EMPLOYEE OBLIGATIONS

Management must ensure that employees are able to disconnect from work outside of normal working hours. Should an employee have concerns surrounding their working time or is unable to disconnect from work, it is important that this is brought to the attention of management in order to resolve any concerns.
Management should be mindful of the time in which emails are being sent. Should management notice that a member of their team is sending emails during non-working hours or are logging in excessively, they should speak to the employee as soon as possible, as this may indicate they are finding it difficult to manage their workload during normal working hours.

COMMUNICATIONS

Employees have the right to disconnect from work outside normal working hours. Emails should be checked and/or sent only during normal working hours, whilst also appreciating that where work patterns differ, some employees may send communications at a time which is inconvenient to another i.e., where one employee works during the weekend, and another does not. Where this is the case, the sender should give consideration to the timing of their communication and understand that the recipient will not be expected to respond until their return to work.
Where a manager sends communications outside normal working hours, employees should not feel the need to respond to said communications until their return to work.

AUTOMATIC REPLIES

All employees are required to activate an automatic response when taking vacation or a leave of absence. The response should advise the sender that you are unavailable, including the start and end date of the period of vacation or leave of absence and that you will respond to their email on your return or contact details for the employee filling in should be provided in the automatic response.

In addition to the above, management will notify you should you be required to activate an automatic response at the end of your normal working day, which will simply advise the sender of your normal working hours and that you will respond to their email on your return to work.

MEETING

All employees should be mindful of the time of those whom they are inviting to attend a meeting, ensuring those invited play an active role and have something to contribute to the matters being discussed. Meetings, either virtual or in person, should only be scheduled within the attending employees’ working hours.

ELECTRONIC DEVICES

Some employees may be provided with handheld devices such as a mobile phone, laptop, tablet etc. These devices are provided to employees to allow flexibility in how such employees complete their work. This does not imply that the employee makes themselves available for work at all times.

EMPLOYEE WELLBEING

As previously mentioned, the health and wellbeing of our employees is of great importance to us, and we strongly encourage our employees to adapt, if needed, and maintain a good work-life balance.

The Business encourages all employees, including those who work remotely or work a flexible arrangement, to book in time with family/friends, engage in an activity after their normal working day, mute their work email accounts after working hours have ended and store their work-related electronic devices in a secure place when outside of working hours in order to allow themselves to switch off and properly disconnect from work.

In addition, it is important that those undertaking a flexible working arrangement or remote working disconnect themselves from work, monitor their working hours and remember to take their breaks as this is also important for their own wellbeing.

REVIEW OF THE POLICY

This Policy will be reviewed and may be amended from time to time based on the needs and experiences of the Business.

ACKNOWLEDGEMENT & AGREEMENT
I acknowledge that I have read, understand and agree to abide by the Right to Disconnect Policy.

SIGNATURE:

Employee
NAME:

Print
DATE:', true)
on conflict (clinic_id, name, version) do update
   set effective_date = excluded.effective_date,
       document_url   = excluded.document_url,
       body           = excluded.body,
       required       = excluded.required;

insert into hr_policies (clinic_id, name, version, effective_date, document_url, body, required)
values ('ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Remote Working Policy', 'Feb 2026', '2026-02-08', '/hub-docs/remote-working-policy.docx', 'Remote Working Policy

SUMMARY

This Remote Working Policy (the “Policy”) applies to all employees of The Business, whether the employee works remotely regularly or under exceptional circumstances as directed by the Business from time to time.

For the purpose of this Policy, “working remotely” includes any circumstance where the employee, instead of performing work primarily at the Business’ office or other location designated by the Business, completes work primarily from a location including the employee’s home or another location chosen by the employee using computer, internet, telephone, and other equipment that facilitates the ability of the employee to complete their work responsibilities.

Employees’ working environment and working practices while working remotely are subject to the same working standards that are applied to the Business’ offices regarding confidentiality, access to Business documents, and workplace health and safety.

REMOTE WORKING ARRANGEMENTS

COMPANY POLICIES

While working remotely, all relevant workplace policies, applicable legislation, and the employee’s contract of employment continue to apply.

EMPLOYEE RESPONSIBILITIES

REMOTE WORKING INFORMATION

Employees who are working remotely must inform their manager of the following information:

   The address and location from which the employee is working remotely (updated as necessary);
  Whether the location is shared with other individuals, and, if so, who and what precautions are or may be taken to preserve confidentiality of the Business’ information;
  The employee’s cell phone number that is being used for business purposes;
  Information in respect of the electronic hardware, internet connection, and telephone capabilities at the remote working location.

Employees must immediately inform their manager of any change to the above information.

SCHEDULE AND TIMEKEEPING

Employees are expected to work their regular hours of work while working remotely.

Remote working employees who are eligible for overtime under applicable employment standards legislation must record all hours worked in a manner designated by the Business and consistent with the hours of work and overtime provisions set out in the Employee Handbook. Employees must obtain approval from their manager prior to working overtime.

REMOTE WORK ENVIRONMENT

Employees working remotely must establish an appropriate work environment within their home or alternative location. The remote work location must have a reliable internet connection sufficient to allow the employee to complete work effectively and efficiently.

Employees must ensure that dependent care arrangements are in place and that personal responsibilities are managed in a way that allows them to successfully meet their job responsibilities without interruption or distraction.

Employees are required to perform work diligently and efficiently during working hours while working remotely and must be available for work at all times during the employee’s working hours or as otherwise directed by the Business.

During an employee’s regular working hours, employees must respond promptly to any calls, emails, or other communications from the Business, or calls, emails, or other communications received from third parties for business purposes. Employees must check in with their manager as directed by their manager.

Employees must observe all applicable health and safety laws and policies in respect of working in a remote work location. Employees may consult with their health and safety worker representative, if applicable, in respect of best practices in setting up a safe and healthy remote work location.

INCIDENT REPORTING

Employees who suffer an injury while working remotely must notify their manager in accordance with the Business’ incident reporting procedures and applicable health and safety laws.

REMOTE WORKING EQUIPMENT AND TECHNOLOGY

The Business will determine, with information supplied by the employee and their manager, the appropriate equipment needs (including hardware, software, modems, phone and data lines, software, etc.) for each remote working arrangement on a case-by-case basis.

The Business will supply the employee with appropriate office supplies (pens, paper, etc.) for successful completion of job responsibilities. It will also reimburse the employee for all other business-related expenses such as phone calls and shipping costs that are reasonably incurred in accordance with job responsibilities, as determined in the Business’ sole discretion.

Employees who are required to work remotely may be required to use their personal computer and internet connection, as well as telephone and telephone connection, for work purposes. The Business may elect to provide computer, telephone, and other office equipment to employees for remote working purposes at the Business’ discretion.

Employees may be required to install software on their personal electronic equipment in order to facilitate remote working.

The Business will provide any additional equipment required by the employee for business purposes as needed, in the Business’ sole discretion.

Prior to commencing remote working, employees must consult with their manager to determine whether the employee has sufficient home resources to support working remotely.

EXPENSES

The Business will reimburse employees for any reasonable business expenses incurred in the course of working remotely, as determined by the Business in its sole discretion. Any such business expenses must be supported by receipts, invoices, or other documentation acceptable to the Business, and must be submitted in accordance with the Business’ expense reimbursement policies.

The Business will not reimburse employees for use of the employee’s personal computer, internet connection, telephone equipment, telephone connection, or other remote work equipment belonging to the employee unless such use results in additional expense to the employee (e.g. overage charges). If an employee has reason to believe that use of personal technological equipment, internet, or cellular services will result in additional charges, the employee must consult with their manager prior to additional charges being incurred.

CONFIDENTIALITY

All work information related to the Business is confidential. Employees must take all reasonable steps to protect Business records at all times against loss, unauthorized access, alteration, or destruction.

Remote working employees are required to take special care to secure all records and to prevent unauthorized disclosure of any Business information. Customer contact information is particularly sensitive as customers have a legal right to expect personal information held about them to be held in utmost confidence. Remote working employees have an obligation to ensure these rights are upheld.

Precautions must be taken to ensure third parties, including members of an employee’s family, visitors, or any other persons visiting, residing, or working at your remote work location are not exposed to any confidential information. Information must not be left unattended at any time, and when materials are not in use they should be locked away in a secure place. Similar precautions must be taken when transporting documents in the course of your work. Computer equipment must be locked and password-protected when unattended for any length of time.

Employees who are working remotely should ensure that their internet connection is secure. Consult with the Business’ IT support for further information.

All electronic work documents and files must be stored on the Business’ servers. Business documents, and in particular sensitive and highly confidential files, must not be stored on employees’ personal hard drives without prior authorization of the Business.

If an employee has any reason to believe that Business information is lost, altered, or has been accessed by any unauthorized person, the employee must immediately report this to their manager.

Use of any computer equipment, software, or other property (whether tangible or intangible) is limited to authorized employees only and may only be used for business purposes. Personal information must not be stored on Business computer equipment. Employees must not install or download any programs on Business computer equipment unless authorized to do so by the Business.

TERMINATING THE REMOTE WORKING ARRANGMENT

Subject to an employee’s employment agreement, the Business may terminate a remote working arrangement and require employees to complete work at the Business’ office or another location designated by the Business at any time. Employees will be given reasonable time, as determined by the Business in its sole discretion, to make arrangements necessary to cease working remotely and commence work at the location designated by the Business.

Employees must return any computer, telephone, or other equipment belonging to the Business and provided to the employee to facilitate remote working promptly on termination of the remote working arrangement.

CONTRAVENTIONS OF THE POLICY

Contraventions of this Policy may lead to disciplinary action up to and including termination of employment.

REVIEW OF THE POLICY

This Policy will be reviewed and may be amended from time to time in the Business’ sole discretion based on the needs and experiences of the Business.

ACKNOWLEDGEMENT & AGREEMENT
I acknowledge that I have read, understand and agree to abide by the Remote Working Policy.

SIGNATURE:

Employee
NAME:

Print
DATE:', true)
on conflict (clinic_id, name, version) do update
   set effective_date = excluded.effective_date,
       document_url   = excluded.document_url,
       body           = excluded.body,
       required       = excluded.required;

insert into hr_policies (clinic_id, name, version, effective_date, document_url, body, required)
values ('ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Professional Development Policy', 'Feb 2026', '2026-02-08', '/hub-docs/professional-development-policy.docx', 'Professional Development Policy

 SUMMARY
Mount Etna Child & Family Services (the “Business”) supports employees who want to pursue further education or training for their professional development. The Professional Development Policy (the “Policy”) sets out requirements for reimbursement of professional development courses, programs, or activities undertaken by employees.
 SCOPE
This Policy applies to all employees of the Business who have completed their probationary period.
 POLICY STATEMENT
The Business has established the following rules around reimbursement of professional development activities:

  Courses, programs, or activities must be relevant to an employee’s role and beneficial to the Business.
  The Policy does not cover personal development; training or development that does not support job-related skills or job-related effectiveness are not reimbursed.
  Employees must seek approval from the Business before beginning a course, program, or activity for which they expect to receive reimbursement.
  Approval will be at the Business’s discretion, taking into account the relevancy to the employee’s role, the benefit to the Business, and budget availability.
  Employees may be required to demonstrate proof of attendance or completion of a course, program, or activity.
  All professional development efforts should respect cost and time limitations, as well as individual and business needs.
  The Business will not reimburse expenses for repeated courses, programs, or activities due to unsuccessful attempts.
  The Business has the right to perform an evaluation at any time during the course, program, or activity to ensure quality and obtain useful information for future applicants.
 TERMINATION OF EMPLOYMENT
If an employee’s employment is terminated for any reason whatsoever, whether occasioned by the employee or by the Business for cause or without cause, the employee must refund the Business the costs covered by the Business under this Policy, as follows:

When Termination Occurs
Refund
Less than 12 months after completion of course, program, or activity
100%
More than 12 months but less than 24 months after completion of course, program, or activity
50%
 REVIEW OF THE POLICY
This Policy will be reviewed and may be amended from time to time based on the needs and experiences of the Business.

ACKNOWLEDGEMENT & AGREEMENT

I acknowledge that I have read, understand, and agree to abide by the Professional Development Policy.

SIGNATURE:

Employee
NAME:

Print
DATE:', true)
on conflict (clinic_id, name, version) do update
   set effective_date = excluded.effective_date,
       document_url   = excluded.document_url,
       body           = excluded.body,
       required       = excluded.required;

insert into hr_policies (clinic_id, name, version, effective_date, document_url, body, required)
values ('ee78d13c-eec9-4512-98bc-d00bca2d08c9', 'Remote Working Agreement', 'Feb 2026', '2026-02-08', '/hub-docs/remote-working-agreement.docx', 'Mount Etna Child & Family Services Inc.

Remote Working Agreement

This agreement is made between Mount Etna Child & Family Services (the “Company”) and Insert Employee Name (the “Employee”) regarding the Employee working remotely instead of in the Company offices.

I, insert employee name, will be working remotely a set out below:

Remote work location:
Insert remote work address
Working hours:
Insert regular working hours, or other hours as agreed upon
The remote work agreement is valid:
Until further notice
For a fixed term: insert date to insert date
Equipment to be provided for the purposes of working remotely:
Insert equipment or N/A

This agreement will be administered in accordance with the Company’s Remote Working Policy, of which a copy has been provided with this agreement.

ACKNOWLEDGMENT AND SIGNATURES

I confirm that I have had the opportunity to read, review, and consider this Agreement and that I am signing it freely, voluntarily, and without duress.

Employee Name

Employee Signature:

Date:

Employer Name

Employer Signature:

Date:', false)
on conflict (clinic_id, name, version) do update
   set effective_date = excluded.effective_date,
       document_url   = excluded.document_url,
       body           = excluded.body,
       required       = excluded.required;

end $seed$;

-- The starter policies in hr-store.ts are only shown when a clinic has none of
-- its own. With these rows present they stop appearing, which is the intended
-- behaviour and also the reason this migration matters: the screen was showing
-- placeholder policy text as though it were the organization's.
