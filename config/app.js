/**
 * Application wide configuration settings
 */
module.exports = {
  
  // The name and contact email address for the site (valid email required)
  name: "kswamy_Personal_Profile",
  description: "An open source Sinup Form ",
  email: "kswamy.chethan@gmail.com",
  
  // Set this option to true if you have an SSL certificate for your site
  ssl: process.env.FORCE_SSL || false,
  
  // Specify a host like 'www.inkrato.com' to force all requests
  // from other domains to be rediected to that domain
  host: process.env.HOST || false,
  
  // If true then allows members with a valid email address to register to
  // request an API Key and be able to call the API endpoints.
  //
  // Currently recommended only for private instances due to potential for abuse
  api: false,

  // You can opt to have all posts in the same discussion space - which works
  // well for smaller, focused communities - or grouped into forums.
  //
  // You need to specify at least one forum object in the forums[] array below 
  // to enable forums. Leave the array empty if you don't need seperate discussion forums.
  forums: [ 
    // { name: "Feedback", icon: "comments-o", description: "Help make inkrato even better" },
    // { name: "Sandbox", icon: "wrench", description: "Try out inkrato here" }
  ],
  
   
};
