import express from "express";
import { Request, Response } from "express";
import jwtDecode from "jwt-decode";
import { TokenSet } from "openid-client";
import { XeroAccessToken, XeroIdToken, XeroClient } from "xero-node";

const session = require("express-session");

const client_id: string = process.env.CLIENT_ID;
const client_secret: string = process.env.CLIENT_SECRET;
const redirectUrl: string = process.env.REDIRECT_URI;
const scopes: string =
  "openid profile email accounting.settings accounting.reports.read accounting.journals.read accounting.contacts accounting.attachments accounting.transactions offline_access";

const xero = new XeroClient({
  clientId: client_id,
  clientSecret: client_secret,
  redirectUris: [redirectUrl],
  scopes: scopes.split(" ")
});

if (!client_id || !client_secret || !redirectUrl) {
  throw Error(
    "Environment Variables not all set - please check your sandbox.config.json in the project root or create one!"
  );
}

const app: express.Application = express();

app.use(express.static(__dirname + "/build"));

app.use(
  session({
    secret: "something crazy",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
  })
);

const authenticationData: any = (req: Request, res: Response) => {
  return {
    decodedIdToken: req.session.decodedIdToken,
    decodedAccessToken: req.session.decodedAccessToken,
    tokenSet: req.session.tokenSet,
    allTenants: req.session.allTenants,
    activeTenant: req.session.activeTenant
  };
};

app.get("/", (req: Request, res: Response) => {
  res.send(
    `<h2>Welcome to Xero's NodeJS starter app</h2><p>Open this URL in a new window, then click Connect to Xero</p><a href='/connect'>Connect to Xero</a>`
  );
});

app.get("/connect", async (req: Request, res: Response) => {
  try {
    const consentUrl: string = await xero.buildConsentUrl();
    res.redirect(consentUrl);
  } catch (err) {
    res.send("Sorry, something went wrong");
  }
});

app.get("/callback", async (req: Request, res: Response) => {
  try {
    const tokenSet: TokenSet = await xero.apiCallback(req.url);
    await xero.updateTenants();

    const decodedIdToken: XeroIdToken = jwtDecode(tokenSet.id_token);
    const decodedAccessToken: XeroAccessToken = jwtDecode(
      tokenSet.access_token
    );

    req.session.decodedIdToken = decodedIdToken;
    req.session.decodedAccessToken = decodedAccessToken;
    req.session.tokenSet = tokenSet;
    req.session.allTenants = xero.tenants;
    // XeroClient is sorting tenants behind the scenes so that most recent / active connection is at index 0
    req.session.activeTenant = xero.tenants[0];

    const authData: any = authenticationData(req, res);

    console.log(authData);

    res.redirect("/organisation");
  } catch (err) {
    res.send("Sorry, something went wrong");
  }
});

app.get("/organisation", async (req: Request, res: Response) => {
  try {
    const tokenSet: TokenSet = await xero.readTokenSet();
    console.log(tokenSet.expired() ? "expired" : "valid");
    const response: any = await xero.accountingApi.getOrganisations(
      req.session.activeTenant.tenantId
    );
    res.send(`Hello, ${response.body.organisations[0].name}`);
  } catch (err) {
    res.send("Sorry, something went wrong");
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
});
