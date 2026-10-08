// =========================================================
// KENEWA members system settings
// Paste your Supabase details below (Supabase > Project Settings > API Keys).
// The publishable key is SAFE to put here: it only allows what the
// database security rules (supabase/setup.sql) permit.
// NEVER paste the secret / service_role key into any website file.
// =========================================================
const KNEWA_SUPABASE_URL = "https://odbptxoohburksftfadn.supabase.co";      // e.g. https://abcdefgh.supabase.co
const KNEWA_SUPABASE_KEY = "sb_publishable_zQg8Wx5ReI8OKlIkgfBrMA_5sNP-N3p";  // starts with sb_publishable_ (or the anon key)

// Official contacts (shown in the members area)
const KNEWA_CONTACT = {
    email: "info@kenewa.org",
    phone: "+61475140471",
    phoneDisplay: "0475 140 471"
};

// Payment details shown to members (get these from the Treasurer)
const KNEWA_PAYMENT = {
    accountName: "Kenyans in New England Welfare Association Inc",
    bsb: "To be added",
    account: "To be added",
    payid: "kenyansnewengland@gmail.com",          // e.g. the association's ABN or email registered as a PayID with the bank
    treasurer: "Hillary Bett",

    // TAP-TO-PAY LINKS (card, Apple Pay, Google Pay)
    // Create each one in Stripe: Payment Links > New (see README, "Tap-to-pay links").
    // Paste the link between the quotes. Leave "" to hide the card button for that item.
    // amount: what the button says. Leave amount as null for links where the member types the amount.
    cardLinks: [
        { purpose: "Joining fees",       label: "Joining fees",   amount: 200,  url: "" },
        { purpose: "Membership renewal", label: "Renewal",        amount: null, url: "" },
        { purpose: "Welfare appeal",     label: "Welfare appeal", amount: null, url: "" },
        { purpose: "Donation",           label: "Donation",       amount: null, url: "" }
    ]
};
