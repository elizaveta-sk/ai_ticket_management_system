import { TicketCategory, TicketStatus } from '../src/generated/prisma/client.ts'
import { prisma } from '../src/lib/prisma.ts'

// Sample tickets for trying out the ticket list in development. Each has a fixed
// messageId, so running this again adds nothing. Deployments must not run it.
if (process.env.NODE_ENV === 'production') {
  throw new Error('Demo tickets must not be seeded in production')
}

const { open, resolved, closed } = TicketStatus
const G = TicketCategory.general_question
const T = TicketCategory.technical_question
const R = TicketCategory.refund_request

type Row = [
  subject: string,
  senderName: string,
  senderEmail: string,
  status: TicketStatus,
  category: TicketCategory | null,
  body: string,
]

// Newest first: recent tickets are mostly open, and older ones mostly finished.
const rows: Row[] = [
  ['Video player stuck at 0% on lesson 4', 'Maya Patel', 'maya.patel@example.com', open, null, 'Lesson 4 of the Python course just shows a spinner. Other lessons play fine. I am on Chrome on a Mac.'],
  ['Refund for accidental double purchase', 'Liam O\'Connor', 'liam.oconnor@example.org', open, null, 'I clicked Pay twice and was charged $89 two times for Data Science Foundations. Please refund one of them.'],
  ['do you offer student discounts?', 'Sofia Rossi', 'sofia.rossi@example.net', open, null, 'I am a full-time university student. Is there a discount if I verify my enrolment?'],
  ['Can\'t log in after changing my email', 'Noah Kim', 'noah.kim@example.com', open, T, 'I updated my email yesterday and now the login page says my credentials are wrong.'],
  ['Certificate has my name misspelled', 'Zoë Müller', 'zoe.mueller@example.org', open, G, 'My certificate says Zoe Muller. Could it be reissued as Zoë Müller? I need it for a job application.'],
  ['URGENT: exam submission failed at the deadline', 'Ethan Brooks', 'ethan.brooks@example.com', open, T, 'The final exam showed a network error when I pressed Submit at 11:58pm. I have a screenshot. Will my answers count?'],
  ['Want my money back, course is not what was advertised', 'Aisha Khan', 'aisha.khan@example.net', open, R, 'The page promised live mentoring but there are only recorded videos. I bought it nine days ago.'],
  ['How long do I keep access after finishing?', 'Oliver Smith', 'oliver.smith@example.com', open, G, 'Once I complete the course, can I still go back to the materials next year?'],
  ['Quiz 3 marks correct answers as wrong', 'Chen Wei', 'chen.wei@example.org', open, T, 'Question 7 of Quiz 3 in SQL Basics rejects the answer shown in the lesson. Two classmates see the same thing.'],
  ['(no subject)', 'Hannah Lee', 'hannah.lee@example.com', open, null, 'Hi, my course page has been blank since this morning. Can someone take a look?'],
  ['Refund request - charged after cancelling subscription', 'Mateo García', 'mateo.garcia@example.org', open, R, 'I cancelled on the 3rd but was still charged $29 on the 5th. The cancellation email is attached.'],
  ['subtitles out of sync in module 2', 'Ingrid Larsen', 'ingrid.larsen@example.net', open, T, 'Subtitles run about ten seconds behind the audio throughout module 2 of the UX course.'],
  ['Is the Excel course suitable for complete beginners?', 'Tom Baker', 'tom.baker@example.com', open, G, 'I have never used spreadsheets for more than a shopping list. Would I keep up?'],
  ['Payment declined but my bank shows a pending charge', 'Fatima Al-Sayed', 'fatima.alsayed@example.org', open, T, 'Checkout said the card was declined, but my bank shows $120 pending. I do not want to pay twice.'],
  ['Can I switch to the evening cohort?', 'Lucas Martin', 'lucas.martin@example.com', open, G, 'My work hours changed. Is there room to move from the morning group to the evening group?'],
  ['Mobile app crashes when downloading lessons', 'Priya Nair', 'priya.nair@example.net', open, T, 'The Android app closes every time I try to save a lesson offline. Version 3.2.1 on a Pixel 7.'],
  ['Refund for course I never started', 'Jack Wilson', 'jack.wilson@example.com', open, R, 'My employer ended up paying for a different program, so I never opened this one. Bought six days ago.'],
  ['Where do I find my invoice?', 'Élodie Dubois', 'elodie.dubois@example.org', open, G, 'I need an invoice with my company\'s VAT number for reimbursement. I cannot find one in my account.'],
  ['Password reset email never arrives', 'Daniel Novak', 'daniel.novak@example.com', open, null, 'I have tried four times and checked spam. Nothing has arrived at this address.'],
  ['Assignment upload rejects my PDF', 'Grace Okafor', 'grace.okafor@example.net', open, T, 'It says the file type is not allowed, even though the instructions ask for a PDF. The file is 3 MB.'],
  ['Are there group rates for a team of 12?', 'Ben Carter', 'ben.carter@example.com', open, G, 'Our company would like to enrol twelve analysts in the same course. Who can I talk to about pricing?'],
  ['charged in USD instead of EUR', 'Anna Kowalska', 'anna.kowalska@example.org', open, R, 'The checkout displayed euros but my card was charged in dollars, and I paid a conversion fee. Can the difference be refunded?'],
  ['Discussion forum says I have no permission', 'Samuel Adeyemi', 'samuel.adeyemi@example.com', open, null, 'I am enrolled, but opening the course forum gives me a 403 page.'],
  ['When does the next Machine Learning cohort begin?', 'Yuki Tanaka', 'yuki.tanaka@example.net', open, G, 'The course page has no start date. I would like to plan my leave around it.'],
  ['Progress reset to zero after the update', 'Rachel Green', 'rachel.green@example.com', open, T, 'I had finished 14 of 20 lessons, and today the dashboard shows nothing completed.'],
  ['Refund - medical reasons', 'Ahmed Hassan', 'ahmed.hassan@example.org', open, R, 'I was hospitalised and cannot continue this term. I can supply a doctor\'s note if needed.'],
  ['Can I get an extension on the capstone project?', 'Isabella Costa', 'isabella.costa@example.com', open, G, 'My laptop died last week and the replacement arrives on Friday. Could I have one extra week?'],
  ['Code editor won\'t run my notebook', 'Oskar Lindqvist', 'oskar.lindqvist@example.net', open, null, 'The in-browser notebook hangs on "Connecting to kernel" and never runs any cell.'],
  ['Wrong course added to my account', 'Nina Petrova', 'nina.petrova@example.com', open, G, 'I bought Intro to Marketing but my dashboard shows Intro to Management.'],
  ['Audio cuts out on Safari', 'Carlos Mendez', 'carlos.mendez@example.org', open, T, 'Sound stops after about a minute in every lesson on Safari 18. Firefox is fine.'],
  ['Refund not received after two weeks', 'Emily Clark', 'emily.clark@example.com', open, R, 'You confirmed my refund on the 2nd, but nothing has reached my account yet.'],
  ['two-factor codes not working', 'Arjun Mehta', 'arjun.mehta@example.net', open, T, 'The six-digit code from my authenticator app is always rejected. I am locked out.'],
  ['Is this course accredited?', 'Charlotte Evans', 'charlotte.evans@example.com', open, null, 'Will my university accept the certificate for credit towards my degree?'],
  ['Can\'t see the bonus materials in my plan', 'Kwame Mensah', 'kwame.mensah@example.org', open, T, 'The Premium plan lists downloadable templates, but the Resources tab is empty for me.'],
  ['Need to change the name on my account', 'Marta Fernández', 'marta.fernandez@example.com', resolved, G, 'I recently married and would like my account and future certificates to use my new surname.'],
  ['Refund for duplicate subscription', 'George Taylor', 'george.taylor@example.net', resolved, R, 'I signed up with two email addresses by mistake and paid for both.'],
  ['Screen goes black in full-screen mode', 'Lena Schmidt', 'lena.schmidt@example.org', resolved, T, 'Video plays with sound but the picture goes black when I switch to full screen in Edge.'],
  ['What happens if I fail the final exam?', 'Harry Walker', 'harry.walker@example.com', resolved, G, 'Do I get another attempt, and is there a fee for retaking it?'],
  ['Download link for slides is broken', 'Amara Diallo', 'amara.diallo@example.net', resolved, T, 'The slides link in lesson 2 of Public Speaking returns a 404.'],
  ['Refund: bought the wrong level', 'Ivan Horvat', 'ivan.horvat@example.org', resolved, R, 'I bought Advanced Excel but meant to buy Intermediate. Could I get a refund, or swap?'],
  ['do certificates expire?', 'Julia Santos', 'julia.santos@example.com', resolved, G, 'My employer asked whether the certificate needs renewing after a certain time.'],
  ['Login loop on the mobile site', 'Peter Nowak', 'peter.nowak@example.net', resolved, T, 'After signing in on my phone I land straight back on the login page.'],
  ['Payment plan options?', 'Layla Haddad', 'layla.haddad@example.com', resolved, G, 'Can I pay for the bootcamp monthly rather than all at once?'],
  ['Charged twice for the same month', 'Andrew Scott', 'andrew.scott@example.org', resolved, R, 'My statement shows two $29 charges for October.'],
  ['Email notifications flood my inbox', 'Mei Lin', 'mei.lin@example.com', resolved, T, 'I get an email for every forum post, even after turning notifications off in settings.'],
  ['Can I share my login with my sister?', 'Rosa Jiménez', 'rosa.jimenez@example.net', resolved, G, 'We are studying together and would prefer to split a single enrolment.'],
  ['Course page shows the wrong language', 'Stefan Weber', 'stefan.weber@example.org', resolved, T, 'Everything appears in Spanish although my profile language is German.'],
  ['Refund request within the 14-day window', 'Olivia Hughes', 'olivia.hughes@example.com', resolved, R, 'I purchased Graphic Design 101 eight days ago and it is not a good fit for me.'],
  ['Which courses count towards the Data Analyst track?', 'Tariq Aziz', 'tariq.aziz@example.net', resolved, G, 'Do I need all five courses, or can I replace one with something I have done elsewhere?'],
  ['Unable to update my credit card', 'Vanessa Moore', 'vanessa.moore@example.com', resolved, T, 'The billing page spins forever after I enter my new card details.'],
  ['Quiz timer ran out while the page was loading', 'Pavel Svoboda', 'pavel.svoboda@example.org', resolved, T, 'The page took five minutes to load, and those minutes counted against my quiz time.'],
  ['Refund for cancelled live workshop', 'Nora Andersen', 'nora.andersen@example.com', resolved, R, 'The workshop on 12 March was cancelled, and I cannot make the new date.'],
  ['can I pause my subscription over summer?', 'Felix Bauer', 'felix.bauer@example.net', resolved, G, 'I will be travelling for two months. Is pausing cheaper than cancelling and rejoining?'],
  ['Transcript download gives an empty file', 'Hana Yamamoto', 'hana.yamamoto@example.com', resolved, T, 'The transcript for lesson 9 downloads as a 0 KB text file.'],
  ['How do I contact my mentor?', 'David Cohen', 'david.cohen@example.org', resolved, G, 'My plan includes a mentor, but I cannot see how to send them a message.'],
  ['Please refund: employer now covers training', 'Sarah Johnson', 'sarah.johnson@example.com', resolved, R, 'My company will pay for this course directly, so I would like my personal payment returned.'],
  ['Peer review assignment stuck on "Pending"', 'Bilal Ahmed', 'bilal.ahmed@example.net', resolved, T, 'My submission has been pending for two weeks and I cannot move on to the next module.'],
  ['Do you have courses in Portuguese?', 'Beatriz Lima', 'beatriz.lima@example.com', resolved, G, 'I would be more comfortable studying in Portuguese. Subtitles would also be fine.'],
  ['Account locked after too many attempts', 'Connor Murphy', 'connor.murphy@example.org', resolved, T, 'I mistyped my password and now I am told to wait. How long does the lock last?'],
  ['Refund for price drop right after purchase', 'Dana Levy', 'dana.levy@example.com', resolved, R, 'The course went on sale at half price two days after I bought it. Can I get the difference back?'],
  ['Recommended order for the web development courses?', 'Emil Johansson', 'emil.johansson@example.net', resolved, G, 'Should I take JavaScript Essentials before or after Responsive Design?'],
  ['Captions missing on the newest lessons', 'Victoria Adams', 'victoria.adams@example.com', resolved, T, 'I am hard of hearing and rely on captions, which are missing from modules 6 and 7.'],
  ['Is there a free trial?', 'Rahul Sharma', 'rahul.sharma@example.org', resolved, G, 'I would like to try a lesson or two before committing to the annual plan.'],
  ['Refund - course content outdated', 'Monika Nagy', 'monika.nagy@example.com', resolved, R, 'The React course uses a version from years ago and much of the code no longer works.'],
  ['Can\'t join the live session', 'Jamal Washington', 'jamal.washington@example.net', resolved, T, 'The Join button is greyed out even though the session started ten minutes ago.'],
  ['Tax receipt for last year', 'Claire Fontaine', 'claire.fontaine@example.org', resolved, G, 'Could you send a receipt for all my payments last year for my tax return?'],
  ['Annual plan renewed without any warning', 'Robert King', 'robert.king@example.com', resolved, R, 'I was charged $240 with no reminder email, and I no longer use the platform.'],
  ['Browser says the certificate download is unsafe', 'Tuan Nguyen', 'tuan.nguyen@example.net', resolved, T, 'Chrome blocks the PDF download of my certificate with a security warning.'],
  ['What laptop do I need for the video editing course?', 'Sana Malik', 'sana.malik@example.com', resolved, G, 'Would an 8 GB machine be enough, or do I need something more powerful?'],
  ['Reset my quiz attempts please', 'Adam Wright', 'adam.wright@example.org', closed, G, 'I used up all my attempts on the practice quiz and would like to revise with it again.'],
  ['Refund for second seat I don\'t need', 'Laura Bianchi', 'laura.bianchi@example.com', closed, R, 'I bought two seats but my colleague left the company before the course started.'],
  ['Site unreachable from my office network', 'Henrik Olsen', 'henrik.olsen@example.net', closed, T, 'The site times out at work but loads at home. Which domains should our IT team allow?'],
  ['Thanks for the great course!', 'Abena Owusu', 'abena.owusu@example.com', closed, G, 'No problem to report. The statistics course helped me land a new role, so thank you.'],
  ['Lessons marked complete that I never watched', 'Gabriel Silva', 'gabriel.silva@example.org', closed, T, 'Modules 3 and 4 show as finished, which throws off my progress tracking.'],
  ['Refund declined - why?', 'Megan Foster', 'megan.foster@example.com', closed, R, 'My refund was turned down. Could you explain which part of the policy applies?'],
  ['Do you support screen readers?', 'Ali Rezaei', 'ali.rezaei@example.net', closed, G, 'I use VoiceOver. Are the course player and quizzes accessible?'],
  ['API key for the coding exercises expired', 'Katarina Ilić', 'katarina.ilic@example.org', closed, T, 'The cloud sandbox reports that my key expired, and I do not see a way to renew it.'],
  ['wrong billing address on my receipt', 'Simon Fischer', 'simon.fischer@example.com', closed, G, 'The receipt has my old address. Could it be regenerated with the current one?'],
  ['Refund after trial converted to paid', 'Jessica Turner', 'jessica.turner@example.net', closed, R, 'I forgot to cancel my free trial and was charged the next day. I have not used anything since.'],
  ['Images not loading in lesson notes', 'Omar Farouk', 'omar.farouk@example.com', closed, T, 'All the diagrams in the lesson notes show as broken image icons.'],
  ['Can minors enrol in your courses?', 'Eva Horváth', 'eva.horvath@example.org', closed, G, 'My daughter is 15 and interested in the coding course. Is that allowed?'],
  ['Gift card code says already redeemed', 'Michael Reed', 'michael.reed@example.com', closed, T, 'I received this gift card yesterday and have never used it, but the code is rejected.'],
  ['Refund for course taken down by instructor', 'Ngozi Eze', 'ngozi.eze@example.net', closed, R, 'The course I paid for has vanished from my dashboard, and I was told it has been retired.'],
  ['How do I delete my account?', 'Paul Lambert', 'paul.lambert@example.org', closed, G, 'I would like my account and personal data removed. Is there a form to fill in?'],
  ['Bookmarks disappeared', 'Kim Soo-jin', 'soojin.kim@example.com', closed, T, 'All the lessons I bookmarked last month have gone from my list.'],
  ['Refund for accidental renewal', 'Thomas Moreau', 'thomas.moreau@example.net', closed, R, 'I meant to turn off auto-renew before the date but missed it by a day.'],
  ['Is the course content downloadable for offline study?', 'Leila Rahimi', 'leila.rahimi@example.com', closed, G, 'I commute without a signal and would like to watch lessons on the train.'],
  ['Scheduled exam slot vanished', 'Viktor Popov', 'viktor.popov@example.org', closed, T, 'I booked Thursday at 10am and got a confirmation, but the slot is no longer on my calendar.'],
  ['Zoom link for office hours doesn\'t work', 'Ana Vasquez', 'ana.vasquez@example.com', closed, T, 'The link says the meeting ID is invalid. It has been that way for the last two weeks.'],
  ['Refund: duplicate charge from Apple Pay', 'Nathan Hall', 'nathan.hall@example.net', closed, R, 'Apple Pay charged me twice when the checkout page refreshed.'],
  ['Is there a community for alumni?', 'Freya Nielsen', 'freya.nielsen@example.org', closed, G, 'I finished the program in spring and would like to stay in touch with others.'],
  ['Exercise autograder times out', 'Ravi Iyer', 'ravi.iyer@example.com', closed, T, 'Every submission to exercise 5 fails with a timeout, even the provided sample solution.'],
  ['Refund for overlapping bundle', 'Alice Martin', 'alice.martin@example.net', closed, R, 'I bought a bundle which includes a course I already owned. Could that portion be refunded?'],
  ['Which browser works best?', 'Bruno Ferreira', 'bruno.ferreira@example.com', closed, G, 'I keep seeing small glitches in Firefox. What do you recommend?'],
  ['Old assignment grade is missing', 'Tessa de Vries', 'tessa.devries@example.org', open, T, 'My grade for assignment 2 from last term has vanished, and I need it for my transcript.'],
  ['Still waiting for an answer about my refund', 'Hugo Lefebvre', 'hugo.lefebvre@example.com', open, R, 'I wrote to you months ago about a refund for the Photoshop course and never heard back.'],
  ['Transfer my enrolment to a friend?', 'Yara Nasser', 'yara.nasser@example.net', resolved, G, 'I cannot take the course after all. Can I pass my place on to a friend?'],
  ['App login fails with "unknown error"', 'William Stone', 'william.stone@example.com', closed, T, 'The iOS app shows "unknown error" on sign-in, while the website works normally.'],
  ['Refund for course bought on the wrong account', 'Sienna Ward', 'sienna.ward@example.org', closed, R, 'I bought it while signed in to my old account. Could you refund it so I can buy it on the new one?'],
  ['Forgot which email I registered with', 'Imani Brown', 'imani.brown@example.com', closed, G, 'I have tried three addresses and none of them work. Can you find my account by name?'],
]

const now = Date.now()
const hour = 60 * 60 * 1000

const { count } = await prisma.ticket.createMany({
  data: rows.map(([subject, senderName, senderEmail, status, category, body], index) => ({
    messageId: `<demo-ticket-${index + 1}@helpdesk.example>`,
    subject,
    senderName,
    senderEmail,
    status,
    category,
    body,
    // Spreads the tickets unevenly over roughly the last five months.
    createdAt: new Date(now - (index * 36 + ((index * index) % 29) + 1) * hour),
  })),
  skipDuplicates: true,
})

console.log(`Added ${count} of ${rows.length} demo tickets`)

await prisma.$disconnect()
