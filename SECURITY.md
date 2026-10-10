# Security

Adeorq runs real terminals on your machine, launches agents with your own accounts and can be
reached from your phone. If you find a way to make it do something its owner did not ask for, I
want to know before anyone else does.

## Reporting a vulnerability

**Report it privately.** On the repository page, open the **Security** tab and choose
**Report a vulnerability**. That opens a private thread that only you and I can read.

Please do not open a public issue with the details. If that button is not there for you, open an
issue that says only "I have a security report" and I will give you a private channel.

A useful report says:

- the version (Settings shows it as "Installed version") and your operating system,
- the steps to reproduce it, as exact as you can make them,
- what you expected and what happened instead,
- how bad you think it is, and why.

## What happens next

I read every report. A fix for a security problem or for anything that can lose your data is
released at once, on its own, without waiting for other work: Adeorq updates itself, so a fix
only protects people once it is published. I will tell you when it is out, and credit you in the
release notes unless you prefer otherwise.

## Which versions get fixes

Only the latest release. Adeorq is updated from inside the app and older versions are not
patched: the fix is to update.

## What is in scope

- The desktop app and its installer, and the update channel.
- The local MCP server the app opens for agents (`127.0.0.1:3012`).
- The phone page and its server (`127.0.0.1:3013`, reached through Tailscale): pairing, the
  keys, and everything a paired phone can make the PC do.
- Anything that lets a web page, a file or the output of a tool give orders to the app or to an
  agent it runs.

Out of scope, because they are not mine to fix: the command-line agents Adeorq launches (Claude
Code, Codex, Gemini CLI and the rest), Tailscale, and your own model accounts. Report those to
their makers.

## Check it yourself

You do not have to take my word for any of this. [`AI-AUDIT.md`](AI-AUDIT.md) is a prompt you can
paste into your own AI agent to get a security review of this repository in your language.

---

**En español.** Si encuentras un fallo de seguridad, cuéntamelo en privado: en la pestaña
**Security** del repositorio, **Report a vulnerability**. No abras una incidencia pública con los
detalles. Leo todos los avisos, y un arreglo de seguridad o de pérdida de datos se publica en el
acto. Solo se corrige la última versión: Adeorq se actualiza desde dentro de la app.
