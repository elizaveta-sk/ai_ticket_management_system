import { Role, SenderType } from '../src/generated/prisma/client.ts'
import { prisma } from '../src/lib/prisma.ts'

// A long conversation on one ticket, for trying out the thread and summaries in
// development. Running this again adds nothing. Deployments must not run it.
if (process.env.NODE_ENV === 'production') {
  throw new Error('Demo replies must not be seeded in production')
}

const ticketId = 7

// Alternates between agent and student, starting with the agent, because the ticket
// itself is the student's first message.
const replies = [
  `Hello Ethan,
Thank you for contacting us, and I am sorry about the error.
I understand how stressful this must be so close to a deadline.
I have opened your exam record and can see you were active at 11:58pm.
I cannot yet see whether your answers reached our servers.
To look into this, I need a few details from you.
Please send the screenshot you mentioned in your first email.
Please also tell me which browser and device you were using.
It would help to know whether you were on Wi-Fi or a wired connection.
Your answers are not lost as far as I can tell at this stage.
Kind regards,
Student Support`,

  `Hi,
Thanks for getting back to me so quickly.
I have attached the screenshot to this email.
It shows a red banner saying "Network error, please try again".
The clock in the corner of my screen says 11:58pm.
I was using Chrome on my Windows laptop at home.
I was on Wi-Fi, and everything else was working normally at the time.
I pressed Submit three times and got the same banner each time.
At 12:01am the page changed and said the exam had closed.
I am really worried, because this exam is 40% of my final grade.
Thanks,
Ethan`,

  `Hello Ethan,
Thank you, the screenshot arrived and it is very helpful.
It matches an error message our exam page shows when a request fails.
I have asked our technical team to pull the server logs for your session.
They will check each of your three submission attempts.
They will also check whether your answers were autosaved along the way.
Our exam page normally autosaves every two minutes.
This means most or all of your work may already be stored.
I do not have the results yet, and I do not want to guess at them.
I expect to hear from the team by tomorrow morning.
I will write to you as soon as I do.
Kind regards,
Student Support`,

  `Hi,
Thank you for the update, that makes me feel slightly better.
I do have one more question while you wait for the logs.
My instructor posted that late submissions get a 20% penalty.
Will that penalty apply to me if the problem was on your side?
I also have a copy of most of my answers in a text document.
I wrote the longer essay answers there first, in case the page crashed.
The document was last saved at about 11:40pm.
Should I send you that document now, or wait until you have the logs?
I would rather not lose marks for something I could not control.
Best,
Ethan`,

  `Hello Ethan,
Please keep that document safe, and do not edit it any further.
There is no need to send it just yet, but we may ask for it later.
The file's saved time could help to show when you wrote your answers.
On the penalty, I cannot make that decision myself.
Late penalties are decided by the exams office, not by Student Support.
If the logs show a fault on our side, I will include that in my report to them.
They normally waive penalties when a technical fault is confirmed.
That is what usually happens, not a promise about your case.
I will have more to tell you once the technical team replies.
Thank you for your patience with this.
Kind regards,
Student Support`,

  `Hi,
Understood, I will leave the document exactly as it is.
I just noticed something else that might be relevant.
When I log in now, my exam page says "Attempt in progress".
It does not say "Submitted", and it does not say "Not attempted" either.
There is a button that says "Resume", but I have not clicked it.
I did not want to change anything before you finished checking.
Is it safe to click it, or could it affect my record?
Also, my classmate Priya had the same red banner at about 11:55pm.
She managed to submit on her second try, so she is fine.
It might mean the problem was affecting more than just me.
Thanks,
Ethan`,

  `Hello Ethan,
Please do not click the Resume button for now.
Reopening the attempt could change the record that we are examining.
You were right to leave it alone, so thank you for checking first.
The "Attempt in progress" status fits with a submission that never completed.
It does not tell us whether your autosaved answers are complete.
What you said about your classmate is useful, so I have passed it on.
I have not named her, only the time and the error she saw.
The technical team can check for other failures around 11:55pm.
I will update you tomorrow morning, even if the logs are not finished.
Please let me know if the status on your page changes.
Kind regards,
Student Support`,

  `Hi,
Good morning, and I hope you have some news for me.
The page still says "Attempt in progress", with no change overnight.
I barely slept, because results come out at the end of next week.
I also emailed my instructor, Dr Osei, to let them know what happened.
They replied that they cannot do anything until the exams office decides.
They did say they would support me if the fault is confirmed.
Is there any form I should be filling in at this stage?
I saw a page about "extenuating circumstances" on the student portal.
Its deadline seems to be five working days after the exam.
I do not want to miss that deadline while we wait for the logs.
Thanks,
Ethan`,

  `Hello Ethan,
Good morning, and I do have an update for you.
The logs show three submission attempts from your account at 11:58pm.
All three failed with a timeout on our side, not on your connection.
The team also found failed submissions from other students around that time.
They are treating this as an incident on our exam service.
I am still waiting on whether your autosaved answers are complete.
On the form, I do recommend you submit it before the five-day deadline.
That protects your position while the rest of this gets sorted out.
You can refer to this ticket in the form, and I will confirm the fault.
I am sorry for the stress that this has caused you.
Kind regards,
Student Support`,

  `Hi,
That is a huge relief, thank you so much for telling me.
I am glad to know it was not something that I did wrong.
I will fill in the extenuating circumstances form today.
The form asks for "supporting evidence", and I have a few things.
I can attach the screenshot and this conversation with you.
Could you give me a short statement that confirms the timeouts?
Would it be better for that to come from you or the technical team?
The form also asks which outcome I am requesting.
I was planning to ask for my autosaved answers to be marked with no penalty.
Does that seem like the right thing to ask for?
Thanks again,
Ethan`,

  `Hello Ethan,
I can give you a statement, and I will send it later today.
It will confirm the time of your attempts and the timeouts on our side.
It will come from Student Support, and that is enough for the form.
On the outcome, I cannot advise you on what the exams office will accept.
It is your decision what you request on the form.
I can say your request should depend on what the autosave contains.
The technical team is checking that now, and I hope to hear today.
You may want to wait for that answer if the deadline allows it.
You still have four working days, so there is a little time.
I will send you both the statement and the autosave result as soon as I can.
Kind regards,
Student Support`,

  `Hi,
That makes sense, so I will wait for the autosave result before submitting.
I have started the rest of the form so that it is ready to go.
I have one other concern, which is about the exam's time limit.
The exam page said I had used 2 hours and 58 minutes of 3 hours.
If I am allowed to resume, would I only get the last two minutes?
I had finished my answers, so I would only need to press Submit.
But I would not want the system to close before I could do it.
Is resuming even a possibility, or would you use the autosave instead?
I would be happy with either option, as long as my work is counted.
Sorry for all the questions, I just want to get this right.
Thanks,
Ethan`,

  `Hello Ethan,
There is no need to apologize, these are sensible questions.
Our current plan does not involve you resuming the attempt.
The technical team would rather recover your answers from the server.
That way you do not have to rely on a two-minute window.
I do have the autosave result now, and it is mostly good news.
Your last successful autosave was at 11:56pm.
It contains answers to all 25 questions, including both essays.
Anything you changed in the last two minutes is not in the autosave.
Please tell me if you remember changing anything after 11:56pm.
Here is the statement I promised, attached to this message.
Kind regards,
Student Support`,

  `Hi,
That is fantastic news, thank you so much.
I have received the statement, and it looks like everything I need.
I have been trying to remember those last few minutes.
I think I only changed one thing after 11:56pm.
It was question 18, a multiple choice question about normalization.
I changed my answer from B to C just before I pressed Submit.
Everything else was finished, and I was only reading it over.
Is it possible to have that one change added to my answers?
I do not have any proof of it, other than my memory.
I will send the form to the exams office today with the statement.
Thanks,
Ethan`,

  `Hello Ethan,
Thank you for being so clear about that change.
The technical team tells me the logs do not record your submitted answers.
The failed requests timed out before the answers could be read.
So I cannot confirm your change to question 18 from our side.
I cannot edit your answers either, as only the exams office could allow it.
My suggestion is to mention it on your form, in your own words.
It is then up to them whether to take it into account.
Please make it clear that it is from memory, as you have told me.
I have now sent the incident report to the exams office as well.
It lists your attempts and the autosave, and it refers to this ticket.
Kind regards,
Student Support`,

  `Hi,
I understand, and thank you for being honest about what you can confirm.
I have submitted the form and mentioned question 18 as you suggested.
I said clearly that it was from memory and that I have no evidence for it.
The portal gave me a reference number, which is EC-48213.
It says I should get a decision within ten working days.
That is longer than I expected, because results come out next week.
What will my results page show when grades are released?
I am worried that it might say I failed or did not attend.
If so, would that have any effect on enrolling for next term?
Enrolment opens the Monday after results come out.
Thanks,
Ethan`,

  `Hello Ethan,
Thank you for the reference number, I have added it to this ticket.
I have asked the exams office how your result will appear next week.
Results under review normally show as "Pending" rather than as a fail.
I would like them to confirm that for your case before you rely on it.
On enrolment, the registrar's office decides that and not Student Support.
I have sent them a question on whether a pending result affects enrolling.
I do not have an answer on that yet, and I do not want to guess.
I have asked both offices to reply this week, given your dates.
I will let you know as soon as I hear from either of them.
Your ticket will stay open until this is settled.
Kind regards,
Student Support`,

  `Hi,
Thank you for chasing both of them for me.
I also heard from Dr Osei, who has seen the incident report.
They said that they are happy to mark the autosaved version once approved.
They also said the essays can be marked as soon as the decision comes through.
That means the delay should just be the time for the exams office to decide.
I did check the page again today, and the status has now changed.
It now says "Under review", and the Resume button has gone.
I assume that is the exams office, and it is nothing for me to worry about?
I have not received any emails about the change.
I will wait to hear from you about the enrolment question.
Thanks,
Ethan`,

  `Hello Ethan,
Yes, I checked, and the exams office made that status change on Tuesday.
It means your attempt is locked while they review your case.
I now have answers from both offices, and they are both reassuring.
The exams office confirms your result will show as "Pending" next week.
It will not show as a fail or as non-attendance.
The registrar confirms that a pending result does not block you from enrolling.
You can enrol on Monday in the normal way, with no extra steps.
The decision on your form is still due within the ten working days.
I cannot tell you what the outcome will be, or about question 18.
Please let me know if anything looks different from this next week.
Kind regards,
Student Support`,

  `Hi,
Thank you, that is everything I needed to know for now.
I will enrol on Monday, and I will watch for the exams office decision.
I really appreciate how you kept me updated through all of this.
I was panicking on the night of the exam, and this has helped a lot.
I will reply here if my results page shows anything other than "Pending".
I will also let you know what the decision says when it arrives.
Should I do anything else to keep this ticket open until then?
If it would be easier to close it, I can always open a new one.
I would just like to keep this history together, if that is possible.
Thanks again for all your help.
Best wishes,
Ethan`,
]

const ticket = await prisma.ticket.findUnique({
  where: { id: ticketId },
  select: { createdAt: true },
})
if (!ticket) throw new Error(`There is no ticket ${ticketId}. Run db:seed:tickets first.`)

const agent = await prisma.user.findFirst({
  where: { role: Role.agent, deletedAt: null },
  orderBy: { createdAt: 'asc' },
  select: { id: true },
})
if (!agent) throw new Error('There is no active agent to write the replies')

const alreadySeeded = await prisma.ticketReply.findFirst({
  where: { ticketId, body: replies[0] },
  select: { id: true },
})

if (alreadySeeded) {
  console.log(`Ticket ${ticketId} already has the demo replies, so nothing was added`)
} else {
  // Spread evenly between the ticket and now, so the thread is in order and in the past.
  const start = ticket.createdAt.getTime()
  const gap = (Date.now() - start) / (replies.length + 1)
  const { count } = await prisma.ticketReply.createMany({
    data: replies.map((body, index) => {
      const fromAgent = index % 2 === 0
      return {
        ticketId,
        body,
        senderType: fromAgent ? SenderType.agent : SenderType.customer,
        authorId: fromAgent ? agent.id : null,
        createdAt: new Date(start + gap * (index + 1)),
      }
    }),
  })
  console.log(`Added ${count} replies to ticket ${ticketId}`)
}

await prisma.$disconnect()
