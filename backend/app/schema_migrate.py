from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def _add_column(conn, table: str, name: str, ddl: str) -> None:
    cols = {col["name"] for col in inspect(conn).get_columns(table)}
    if name not in cols:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


def ensure_schema(engine: Engine) -> None:
    with engine.begin() as conn:
        tables = set(inspect(conn).get_table_names())
        if "loads" in tables:
            for name, ddl in (
                ("weight_tonnes", "FLOAT DEFAULT 0"),
                ("container_count", "INTEGER DEFAULT 0"),
                ("truck_spec", "VARCHAR(255) DEFAULT ''"),
                ("urgency", "VARCHAR(40) DEFAULT 'standard'"),
                ("distance_km", "FLOAT DEFAULT 0"),
                ("currency", "VARCHAR(8) DEFAULT 'USD'"),
                ("trucks_needed", "INTEGER DEFAULT 1"),
                ("trucks_provided", "INTEGER DEFAULT 0"),
                ("truck_details", "TEXT DEFAULT ''"),
                ("quote_breakdown", "TEXT DEFAULT ''"),
                ("transporter_user_id", "INTEGER"),
            ):
                _add_column(conn, "loads", name, ddl)
            conn.execute(
                text(
                    "UPDATE loads SET weight_tonnes = ROUND(weight_lbs / 2204.62, 2) "
                    "WHERE (weight_tonnes IS NULL OR weight_tonnes = 0) AND weight_lbs > 0"
                )
            )
        if "trucks" in tables:
            for name, ddl in (
                ("vehicle_type", "VARCHAR(40) DEFAULT 'double_diff'"),
                ("capacity_tonnes", "FLOAT DEFAULT 28"),
                ("spec", "VARCHAR(255) DEFAULT ''"),
                ("owner_user_id", "INTEGER"),
                ("lat", "FLOAT"),
                ("lng", "FLOAT"),
                ("heading", "FLOAT DEFAULT 0"),
                ("speed_kmh", "FLOAT DEFAULT 0"),
                ("location_updated_at", "DATETIME"),
            ):
                _add_column(conn, "trucks", name, ddl)
        if "drivers" in tables:
            _add_column(conn, "drivers", "owner_user_id", "INTEGER")
            _add_column(conn, "drivers", "vehicle_type", "VARCHAR(40) DEFAULT 'double_diff'")
