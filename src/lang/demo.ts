/** The team shown by `ion preview` when no file is given. Uses the scripted "demo" model. */
export const DEMO_SOURCE = `# Ion demo team: no API key needed.
tool shout(text):
    describe "Makes text LOUD"
    give back upper(text) + "!"

agent boss:
    model "demo"
    role "You lead the team."
    can ask helper, scout
    input text, voice
    output text

agent helper:
    model "demo"
    role "Does the hands-on work."
    can use shout
    can run commands

agent scout:
    model "demo"
    role "Researches things online."
    can browse the web

serve boss
`;
