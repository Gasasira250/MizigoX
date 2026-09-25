from app.pricing import marketplace_economics
from app.roles import is_admin
from app.schemas import LoadListOut, LoadOut


def dump_load(load, user, *, detail: bool = True):
    model = LoadOut if detail else LoadListOut
    out = model.model_validate(load)
    if not is_admin(user):
        return out
    return out.model_copy(update=marketplace_economics(load.rate))
