---
'logixlysia': patch
---

A handler that forwards its request to another app with its own plugin (`inner.handle(request)`) no longer loses the outer app's access line, and with several plugin instances each module's routes are logged through that module's own instance, with its own context and transports, again. Since 6.10.0 every line went through the first instance. Creating one instance and sharing it is still the recommended setup.
