FROM nginx:alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY index.html styles.css manifest.webmanifest sw.js favicon.ico icon-192.png icon-512.png /usr/share/nginx/html/
COPY *.js /usr/share/nginx/html/
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
