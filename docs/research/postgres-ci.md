# PostgreSQL CI

Retrieved 2026-11-18. The [GitHub Actions PostgreSQL service guide](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)
documents running a PostgreSQL service on a Linux runner, mapping the service port to the
runner, and waiting for readiness with `pg_isready`. The integration job uses disposable
databases for the two PostgreSQL majors in the project plan.
