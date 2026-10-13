// =========================================================
// KENEWA EVENTS LIST: edit this file to add or change events.
// The Events page (and the countdown on the home page) are built from it.
//
// For each event:
//   id       short unique name, lowercase with hyphens (used in links)
//   title    event name
//   date     exact date as "YYYY-MM-DD", or null if not set yet
//   month    "YYYY-MM": the month it falls in (used when date is null)
//   when     how the date should read on the page
//   time     e.g. "2:00 pm to 7:00 pm", or "" if not set
//   place    where it is
//   cost     e.g. "Free", "$10 adults, kids free", or "" if not set
//   for      who it's for. Any of: "everyone", "families", "youth",
//            "women", "culture", "sport", "members"
//   status   "confirmed", "tbc" (date or venue to be confirmed),
//            or "proposed" (an idea that still needs planning)
//   featured true for the event to show at the top of the Events page
//   about    one or two sentences about the event
//
// Copy an event (from { to },) to add a new one. Keep the commas.
// Past events disappear from the list by themselves the day after.
// =========================================================
const KNEWA_EVENTS = [
    {
        id: "fiesta-la-peel-2026",
        title: "Fiesta La Peel",
        date: null, month: "2026-10",
        when: "October 2026, date set by Tamworth Regional Council",
        time: "", place: "Bicentennial Park, Tamworth", cost: "",
        for: ["everyone", "families", "culture"],
        status: "tbc", featured: false,
        about: "Tamworth's multicultural festival. KENEWA plans to take part with Kenyan food, music and dance. Come and find us."
    },
    {
        id: "mashujaa-2026",
        title: "Mashujaa Day: honouring our heroes",
        date: null, month: "2026-10",
        when: "Around 20 October 2026, date to be confirmed",
        time: "", place: "Tamworth, venue to be confirmed", cost: "",
        for: ["everyone", "families", "culture"],
        status: "tbc", featured: false,
        about: "Heroes' Day: recognising the volunteers, elders and students who hold our community together."
    },
    {
        id: "jamhuri-2026",
        title: "Jamhuri Day 2026",
        date: "2026-12-12", month: "2026-12",
        when: "Saturday 12 December 2026",
        time: "Time to be confirmed", place: "Tamworth, venue to be confirmed", cost: "",
        for: ["everyone", "families", "culture", "youth"],
        status: "tbc", featured: true,
        about: "Kenya's biggest national day and our end-of-year celebration: nyama choma, music, dance and games for the children. Friends from across New England are welcome."
    },
    {
        id: "agm-2027",
        title: "First Annual General Meeting",
        date: null, month: "2027-02",
        when: "Early 2027, date to be set",
        time: "", place: "Tamworth, venue to be confirmed", cost: "Free",
        for: ["members"],
        status: "tbc", featured: false,
        about: "Hear the year's reports, see the accounts and elect the committee. All financial members can vote; everyone is welcome to listen."
    },
    {
        id: "harmony-week-2027",
        title: "Harmony Week",
        date: null, month: "2027-03",
        when: "Around 21 March 2027",
        time: "", place: "Tamworth", cost: "",
        for: ["everyone", "families", "culture"],
        status: "tbc", featured: false,
        about: "Joining the wider community to celebrate Australia's cultural diversity. Everyone belongs."
    },
    {
        id: "africa-day-2027",
        title: "Africa Day",
        date: null, month: "2027-05",
        when: "25 May 2027, celebration date to be confirmed",
        time: "", place: "Venue to be confirmed", cost: "",
        for: ["everyone", "families", "culture"],
        status: "tbc", featured: false,
        about: "A celebration of African unity, which we hope to share with other African communities in New England."
    },
    {
        id: "madaraka-2027",
        title: "Madaraka Day",
        date: null, month: "2027-06",
        when: "1 June 2027, celebration date to be confirmed",
        time: "", place: "Tamworth, venue to be confirmed", cost: "",
        for: ["everyone", "families", "culture"],
        status: "tbc", featured: false,
        about: "Marking Kenya's self-rule with a community lunch or dinner."
    },

    // ---- Ideas from our portfolios. UPDATE: remove any the committee doesn't plan to run. ----
    {
        id: "family-sports-day",
        title: "Family sports day",
        date: null, month: "",
        when: "Being planned for 2027",
        time: "", place: "To be decided", cost: "",
        for: ["everyone", "families", "sport", "youth"],
        status: "proposed", featured: false,
        about: "Fun runs, football and games for every age and ability, followed by a shared lunch. Want to help organise it?"
    },
    {
        id: "students-welcome",
        title: "Students' welcome evening",
        date: null, month: "",
        when: "Being planned for the start of the 2027 university year",
        time: "", place: "Armidale or Tamworth, to be decided", cost: "",
        for: ["youth"],
        status: "proposed", featured: false,
        about: "A friendly welcome for Kenyan and African students at UNE and TAFE: meet people, share food and find support."
    },
    {
        id: "womens-network",
        title: "Women's network launch",
        date: null, month: "",
        when: "Being planned for 2027",
        time: "", place: "To be decided", cost: "",
        for: ["women"],
        status: "proposed", featured: false,
        about: "An afternoon to start our women's network and talk about savings circles in the chama tradition."
    }
];
