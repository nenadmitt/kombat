We need to implement, login with email token functionality

So we'll create two modules:

1. emails
2. authentications


## EMAILS module

We'll have a module that allows us to send an email to a certain address, provide body etc.

We'll have an email serveice with method sendLoginToken(email, token);

## Authentication

We'll have endpoints for "request token" via email.
1. If user is not created, we create a new one
2. Send email
3. Have endpoint where user can excange token for jwt

4. The email token entity should be in a db and expire in 15 minutes. It should be 8 letters.

5. Under authentication, we should also have JWTTokenGuard that allows me to 
 - Use token guard under endpoints and Inject @SecurityContext where i can pull the userId etc.