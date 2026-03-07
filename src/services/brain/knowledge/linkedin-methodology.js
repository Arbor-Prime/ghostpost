/**
 * LinkedIn Methodology — Brain Knowledge Module
 * 
 * This is NOT an API. It's knowledge the brain uses when operating on LinkedIn.
 * When GhostPost is composing a LinkedIn DM, connection note, comment, or post,
 * this module provides the rules, patterns, and psychology that make it effective.
 * 
 * Based on Lara Acosta / Cleo's playbook ($0 → $60K MRR in 2 months):
 * - Edu-selling: educate without CTA, build trust before asking
 * - SLAY / PAS frameworks for content structure  
 * - ICP vs IFP audience awareness
 * - Scarcity and launch psychology
 * - Waitlist nurture sequencing
 * - 4-3-2-1 content rhythm
 * 
 * The prompt enricher calls getLinkedInKnowledge() and injects it
 * into the system prompt whenever the platform is LinkedIn.
 */

/**
 * Core LinkedIn communication knowledge.
 * Injected into the brain's system prompt for any LinkedIn action.
 */
function getLinkedInKnowledge(context = 'general') {
  const base = `
LINKEDIN COMMUNICATION KNOWLEDGE:

You are operating on LinkedIn. This platform has specific norms that differ from X/Twitter and Instagram.

HOW PEOPLE COMMUNICATE ON LINKEDIN:
- Professional but personal. The best performers sound like a knowledgeable friend, not a corporate account.
- First-person storytelling outperforms advice-giving 3:1.
- Vulnerability mixed with expertise creates trust faster than authority alone.
- Nobody reads past the first 2 lines unless you create genuine curiosity.
- The "See more" fold appears after the first line on mobile — every word counts.
- Hashtags reduce reach. Emojis in the first line reduce reach. Links in post reduce reach.
- Comments in the first hour determine whether the algorithm pushes a post to the wider network.

THE EDU-SELLING PRINCIPLE (CRITICAL):
The highest-converting approach on LinkedIn is to educate without selling.
- Give away your best knowledge for free
- Answer people's biggest problems directly
- Never hard-sell in a first interaction
- 3 out of every 4 touchpoints should have ZERO call to action
- People buy from people they trust, and trust is built by being useful without asking for anything
- When you DO pitch (every 4th touchpoint), the trust is already built and conversion is dramatically higher

TWO AUDIENCES TO BE AWARE OF:
- ICP (Ideal Client Persona): Potential buyers. They have a problem you solve. Content for them focuses on pain, cost of inaction, and specific solutions.
- IFP (Ideal Follower Persona): Your community. They may never buy but they engage, amplify, and build social proof. Content for them focuses on education, entertainment, and relatability.
- Connection requests and DMs should identify which audience the recipient is BEFORE writing the message.
`;

  const contextKnowledge = {
    cold_dm: `
COLD DM RULES ON LINKEDIN:
- NEVER lead with a pitch. Ever. Not even a soft one.
- Open with something specific about their content, company, or recent post
- Ask a genuine question that shows you've done research
- Keep it under 50 words — LinkedIn DMs that get replies are SHORT
- No links in first message. No attachments. No pitch decks.
- The goal of the first DM is to START A CONVERSATION, not close a deal
- Follow up once after 5-7 days if no reply. Never more than twice.
- Best opening patterns: compliment + specific question, shared connection reference, reaction to their recent post
- Worst opening patterns: "Hi [name], I noticed your profile...", anything with "I'd love to connect", any template that starts with "I"
`,
    connection_request: `
CONNECTION REQUEST RULES:
- You have 300 characters for the note. Use them ALL.
- Mention something specific — their recent post, a mutual connection, their company, an article they wrote
- State WHY you want to connect in ONE sentence
- Never say "I'd love to pick your brain" or "Let's connect and see if there's synergy"
- Best pattern: "[Specific thing about them]. [Why it matters to you]. [Simple ask]."
- Example: "Your post about card processing fees at independent restaurants hit home. Building something in that space. Would value your perspective."
- If they accept, DO NOT immediately pitch. Wait 2-3 days, then engage with their content before DMing.
`,
    comment: `
COMMENT RULES ON LINKEDIN:
- Add value, don't just agree. "Great post!" is invisible.
- Share a personal experience related to their point
- Ask a follow-up question that shows genuine curiosity
- Disagree respectfully with a counter-example (this gets the most engagement)
- Keep comments under 3 sentences unless you're telling a story
- Comment on posts from people you want to connect with BEFORE sending a connection request — warm them up
`,
    post_creation: `
POST CREATION RULES (SLAY/PAS):
- Hook: 8 words or fewer. Must create curiosity, shock, or promise.
- Rehook: Second line must be equally compelling.
- One sentence per line. Blank line between each.
- 800-1200 characters total for optimal engagement.
- Broad → Narrow → Niche structure: hook catches everyone, body narrows to your industry, detail gets ultra-specific.
- SLAY: Story → Lesson → Actionable → You (point back at reader)
- PAS: Problem → Agitate → Solution
- End with a question to drive comments (unless edu-selling, where you end with a thought-provoking statement)
- The 4-3-2-1 rhythm: 4 posts/week, 3 pillars (growth/industry/sales), 2 frameworks (SLAY/PAS), 1 voice

SCARCITY AND LAUNCH PSYCHOLOGY:
- Limited spots create urgency
- Lifetime discounts incentivise early action
- Waitlist exclusivity builds FOMO
- The best launches feel like letting people IN, not pushing something OUT
- Pre-build trust for weeks with edu-sell content before asking for money
`,
    general: ''
  };

  return base + (contextKnowledge[context] || contextKnowledge.general);
}

/**
 * Get specific knowledge for the brain based on what action GP is about to take
 */
function getActionKnowledge(action) {
  switch (action) {
    case 'send_dm':
      return getLinkedInKnowledge('cold_dm');
    case 'send_connection':
      return getLinkedInKnowledge('connection_request');
    case 'write_comment':
      return getLinkedInKnowledge('comment');
    case 'create_post':
      return getLinkedInKnowledge('post_creation');
    default:
      return getLinkedInKnowledge('general');
  }
}

module.exports = { getLinkedInKnowledge, getActionKnowledge };
