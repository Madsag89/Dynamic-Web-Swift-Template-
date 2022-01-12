using Dynamicweb.Extensibility.Notifications;
2using Dynamicweb.Notifications;
3using System.Configuration;
4using System.Data.SqlClient;
5using System.Web;
6using System.Xml;
7
8namespace WebApplication.CustomModules.NotificationSubscribers.Application
9{
10    [Subscribe(Standard.Application.BeforeStart)]
11    public class BeforeStartSubscriber : NotificationSubscriber
12    {
13        public override void OnNotify(string notification, NotificationArgs args)
14        {
15            if (args == null)
16                return;
17
18            if (!(args is Standard.Application.BeforeStartArgs))
19                return;
20
21            var connectionString = ConfigurationManager.ConnectionStrings["WebsiteDb"].ConnectionString;
22            var decoder = new SqlConnectionStringBuilder(connectionString);
23
24            var doc = new XmlDocument();
25            var gbSettings = HttpContext.Current.Server.MapPath("~/Files/GlobalSettings.aspx");
26
27            doc.Load(gbSettings);
28
29            doc.SelectSingleNode("/Globalsettings/System/Database/Password").InnerText = decoder.Password;
30            doc.SelectSingleNode("/Globalsettings/System/Database/UserName").InnerText = decoder.UserID;
31            doc.SelectSingleNode("/Globalsettings/System/Database/Database").InnerText = decoder.InitialCatalog;
32            doc.SelectSingleNode("/Globalsettings/System/Database/SQLServer").InnerText = decoder.DataSource;
33
34            doc.Save(gbSettings);
35
36            if (Dynamicweb.Configuration.SystemConfiguration.Instance != null)
37            {
38                Dynamicweb.Configuration.SystemConfiguration.Reset();
39            }
40        }
41    }
42}